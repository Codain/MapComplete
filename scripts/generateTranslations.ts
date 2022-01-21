import * as fs from "fs";
import {readFileSync, writeFileSync} from "fs";
import {Utils} from "../Utils";
import ScriptUtils from "./ScriptUtils";

const knownLanguages = ["en", "nl", "de", "fr", "es", "gl", "ca"];

class TranslationPart {

    contents: Map<string, TranslationPart | string> = new Map<string, TranslationPart | string>()

    add(language: string, obj: any) {
        for (const key in obj) {
            const v = obj[key]
            if (!this.contents.has(key)) {
                this.contents.set(key, new TranslationPart())
            }
            const subpart = this.contents.get(key) as TranslationPart

            if (typeof v === "string") {
                subpart.contents.set(language, v)
            } else {
                subpart.add(language, v)
            }

        }
    }

    addTranslationObject(translations: any, context?: string) {
        for (const translationsKey in translations) {
            if (!translations.hasOwnProperty(translationsKey)) {
                continue;
            }
            if (translationsKey == "then") {
                throw "Suspicious translation at " + context
            }
            const v = translations[translationsKey]
            if (typeof (v) != "string") {
                console.error(`Non-string object at ${context} in translation while trying to add more translations to '` + translationsKey + "': ", v)
                throw "Error in an object depicting a translation: a non-string object was found. (" + context + ")\n    You probably put some other section accidentally in the translation"
            }
            this.contents.set(translationsKey, v)
        }
    }

    recursiveAdd(object: any, context: string) {
        const isProbablyTranslationObject = knownLanguages.some(l => object.hasOwnProperty(l));
        if (isProbablyTranslationObject) {
            this.addTranslationObject(object, context)
            return;
        }

        for (let key in object) {
            if (!object.hasOwnProperty(key)) {
                continue;
            }

            const v = object[key]

            if (v == null) {
                console.warn("Got a null value for key ", key)
                continue
            }

            if (v["id"] !== undefined && context.endsWith("tagRenderings")) {
                // We use the embedded id as key instead of the index as this is more stable
                // Note: indonesian is shortened as 'id' as well!
                if (v["en"] !== undefined || v["nl"] !== undefined) {
                    // This is probably a translation already!
                    // pass
                } else {

                    key = v["id"]
                    if (typeof key !== "string") {
                        throw "Panic: found a non-string ID at" + context
                    }
                }
            }

            if (typeof v !== "object") {
                continue;
            }

            if (!this.contents.get(key)) {
                this.contents.set(key, new TranslationPart())
            }

            (this.contents.get(key) as TranslationPart).recursiveAdd(v, context + "." + key);
        }
    }

    knownLanguages(): string[] {
        const languages = []
        for (let key of Array.from(this.contents.keys())) {
            const value = this.contents.get(key);

            if (typeof value === "string") {
                if (key === "#") {
                    continue;
                }
                languages.push(key)
            } else {
                languages.push(...(value as TranslationPart).knownLanguages())
            }
        }
        return Utils.Dedup(languages);
    }

    toJson(neededLanguage?: string): string {
        const parts = []
        let keys = Array.from(this.contents.keys())
        keys = keys.sort()
        for (let key of keys) {
            let value = this.contents.get(key);

            if (typeof value === "string") {
                value = value.replace(/"/g, "\\\"")
                    .replace(/\n/g, "\\n")
                if (neededLanguage === undefined) {
                    parts.push(`\"${key}\": \"${value}\"`)
                } else if (key === neededLanguage) {
                    return `"${value}"`
                }

            } else {
                const sub = (value as TranslationPart).toJson(neededLanguage)
                if (sub !== "") {
                    parts.push(`\"${key}\": ${sub}`);
                }

            }
        }
        if (parts.length === 0) {
            return "";
        }
        return `{${parts.join(",")}}`;
    }
}

/**
 * Checks that the given object only contains string-values
 * @param tr
 */
function isTranslation(tr: any): boolean {
    for (const key in tr) {
        if (typeof tr[key] !== "string") {
            return false;
        }
    }
    return true;
}

/**
 * Converts a translation object into something that can be added to the 'generated translations'
 * @param obj
 * @param depth
 */
function transformTranslation(obj: any, depth = 1) {

    if (isTranslation(obj)) {
        return `new Translation( ${JSON.stringify(obj)} )`
    }

    let values = ""
    for (const key in obj) {
        if (key === "#") {
            continue;
        }
        if (key.match("^[a-zA-Z0-9_]*$") === null) {
            throw "Invalid character in key: " + key
        }
        const value = obj[key]

        if (isTranslation(value)) {
            values += (Utils.Times((_) => "  ", depth)) + "get " + key + "() { return new Translation(" + JSON.stringify(value) + ") }" + ",\n"
        } else {
            values += (Utils.Times((_) => "  ", depth)) + key + ": " + transformTranslation(value, depth + 1) + ",\n"
        }
    }
    return `{${values}}`;

}

/**
 * Generates the big compiledTranslations file
 */
function genTranslations() {
    const translations = JSON.parse(fs.readFileSync("./assets/generated/translations.json", "utf-8"))
    const transformed = transformTranslation(translations);

    let module = `import {Translation} from "../../UI/i18n/Translation"\n\nexport default class CompiledTranslations {\n\n`;
    module += " public static t = " + transformed;
    module += "}"

    fs.writeFileSync("./assets/generated/CompiledTranslations.ts", module);


}

/**
 * Reads 'lang/*.json', writes them into to 'assets/generated/translations.json'.
 * This is only for the core translations
 */
function compileTranslationsFromWeblate() {
    const translations = ScriptUtils.readDirRecSync("./langs", 1)
        .filter(path => path.indexOf(".json") > 0)

    const allTranslations = new TranslationPart()

    for (const translationFile of translations) {
        try{
            
        const contents = JSON.parse(readFileSync(translationFile, "utf-8"));
        let language = translationFile.substring(translationFile.lastIndexOf("/") + 1)
        language = language.substring(0, language.length - 5)
        allTranslations.add(language, contents)
        }catch (e) {
            throw "Could not read file "+ translationFile+" due to "+e
        }
    }

    writeFileSync("./assets/generated/translations.json", JSON.stringify(JSON.parse(allTranslations.toJson()), null, "    "))

}

/**
 * Get all the strings out of the layers; writes them onto the weblate paths
 * @param objects
 * @param target
 */
function generateTranslationsObjectFrom(objects: { path: string, parsed: { id: string } }[], target: string) {
    const tr = new TranslationPart();

    for (const layerFile of objects) {
        const config: { id: string } = layerFile.parsed;
        const layerTr = new TranslationPart();
        if (config === undefined) {
            throw "Got something not parsed! Path is " + layerFile.path
        }
        layerTr.recursiveAdd(config, layerFile.path)
        tr.contents.set(config.id, layerTr)
    }

    const langs = tr.knownLanguages();
    for (const lang of langs) {
        if (lang === "#" || lang === "*") {
            // Lets not export our comments or non-translated stuff
            continue;
        }
        let json = tr.toJson(lang)
        try {

            json = JSON.stringify(JSON.parse(json), null, "    "); // MUST BE FOUR SPACES
        } catch (e) {
            console.error(e)
        }

        writeFileSync(`langs/${target}/${lang}.json`, json)
    }
}

/**
 * Merge two objects together
 * @param source: where the tranlations come from
 * @param target: the object in which the translations should be merged
 * @param language: the language code
 * @param context: context for error handling
 * @constructor
 */
function MergeTranslation(source: any, target: any, language: string, context: string = "") {

    let keyRemapping: Map<string, string> = undefined
    if (context.endsWith(".tagRenderings")) {
        keyRemapping = new Map<string, string>()
        for (const key in target) {
            keyRemapping.set(target[key].id, key)
        }
    }

    for (const key in source) {
        if (!source.hasOwnProperty(key)) {
            continue
        }

        const sourceV = source[key];
        const targetV = target[keyRemapping?.get(key) ?? key]

        if (typeof sourceV === "string") {
            // Add the translation
            if (targetV === undefined) {
                if (typeof target === "string") {
                    throw "Trying to merge a translation into a fixed string at " + context + " for key " + key;
                }
                target[key] = source[key];
                continue;
            }

            if (targetV[language] === sourceV) {
                // Already the same
                continue;
            }

            if (typeof targetV === "string") {
                throw `At context ${context}: Could not add a translation in language ${language}. The target object has a string at the given path, whereas the translation contains an object.\n    String at target: ${targetV}\n    Object at translation source: ${JSON.stringify(sourceV)}`
            }

            targetV[language] = sourceV;
            let was = ""
            if (targetV[language] !== undefined && targetV[language] !== sourceV) {
                was = " (overwritten " + targetV[language] + ")"
            }
            console.log("   + ", context + "." + language, "-->", sourceV, was)
            continue
        }
        if (typeof sourceV === "object") {
            if (targetV === undefined) {
                try {
                    target[language] = sourceV;
                } catch (e) {
                    throw `At context${context}: Could not add a translation in language ${language} due to ${e}`
                }
            } else {
                MergeTranslation(sourceV, targetV, language, context + "." + key);
            }
            continue;
        }
        throw "Case fallthrough"

    }
    return target;
}

function mergeLayerTranslation(layerConfig: { id: string }, path: string, translationFiles: Map<string, any>) {
    const id = layerConfig.id;
    translationFiles.forEach((translations, lang) => {
        const translationsForLayer = translations[id]
        MergeTranslation(translationsForLayer, layerConfig, lang, path + ":" + id)
    })

}

function loadTranslationFilesFrom(target: string): Map<string, any> {
    const translationFilePaths = ScriptUtils.readDirRecSync("./langs/" + target)
        .filter(path => path.endsWith(".json"))

    const translationFiles = new Map<string, any>();
    for (const translationFilePath of translationFilePaths) {
        let language = translationFilePath.substr(translationFilePath.lastIndexOf("/") + 1)
        language = language.substr(0, language.length - 5)
        try {
            translationFiles.set(language, JSON.parse(readFileSync(translationFilePath, "utf8")))
        } catch (e) {
            console.error("Invalid JSON file or file does not exist", translationFilePath)
            throw e;
        }
    }
    return translationFiles;
}

/**
 * Load the translations from the weblate files back into the layers
 */
function mergeLayerTranslations() {

    const layerFiles = ScriptUtils.getLayerFiles();
    for (const layerFile of layerFiles) {
        mergeLayerTranslation(layerFile.parsed, layerFile.path, loadTranslationFilesFrom("layers"))
        writeFileSync(layerFile.path, JSON.stringify(layerFile.parsed, null, "  "))
    }
}

/**
 * Load the translations into the theme files
 */
function mergeThemeTranslations() {
    const themeFiles = ScriptUtils.getThemeFiles();
    for (const themeFile of themeFiles) {
        const config = themeFile.parsed;
        mergeLayerTranslation(config, themeFile.path, loadTranslationFilesFrom("themes"))

        const oldLanguages = config.language;
        const allTranslations = new TranslationPart();
        allTranslations.recursiveAdd(config, themeFile.path)
        const newLanguages = allTranslations.knownLanguages()
        const languageDiff = newLanguages.filter(l => oldLanguages.indexOf(l) < 0).join(", ")
        if (languageDiff !== "") {
            config.language = newLanguages;
            console.log(" :hooray: Got a new language for theme", config.id, ":", languageDiff)
        }
        writeFileSync(themeFile.path, JSON.stringify(config, null, "  "))
    }
}


const themeOverwritesWeblate = process.argv[2] === "--ignore-weblate"
const questionsPath = "assets/tagRenderings/questions.json"
const questionsParsed = JSON.parse(readFileSync(questionsPath, 'utf8'))
if (!themeOverwritesWeblate) {
    mergeLayerTranslations();
    mergeThemeTranslations();

    mergeLayerTranslation(questionsParsed, questionsPath, loadTranslationFilesFrom("shared-questions"))
    writeFileSync(questionsPath, JSON.stringify(questionsParsed, null, "  "))

} else {
    console.log("Ignore weblate")
}
generateTranslationsObjectFrom(ScriptUtils.getLayerFiles(), "layers")
generateTranslationsObjectFrom(ScriptUtils.getThemeFiles(), "themes")


generateTranslationsObjectFrom([{path: questionsPath, parsed: questionsParsed}], "shared-questions")

if (!themeOverwritesWeblate) {
// Generates the core translations
    compileTranslationsFromWeblate();
}
genTranslations()
import Combine from "../src/UI/Base/Combine"
import BaseUIElement from "../src/UI/BaseUIElement"
import { existsSync, mkdirSync, writeFile, writeFileSync } from "fs"
import { AllKnownLayouts } from "../src/Customizations/AllKnownLayouts"
import TableOfContents from "../src/UI/Base/TableOfContents"
import SimpleMetaTaggers from "../src/Logic/SimpleMetaTagger"
import SpecialVisualizations from "../src/UI/SpecialVisualizations"
import { ExtraFunctions } from "../src/Logic/ExtraFunctions"
import Title from "../src/UI/Base/Title"
import QueryParameterDocumentation from "../src/UI/QueryParameterDocumentation"
import ScriptUtils from "./ScriptUtils"
import List from "../src/UI/Base/List"
import Translations from "../src/UI/i18n/Translations"
import themeOverview from "../src/assets/generated/theme_overview.json"
import LayoutConfig from "../src/Models/ThemeConfig/LayoutConfig"
import bookcases from "../src/assets/generated/themes/bookcases.json"
import fakedom from "fake-dom"

import Hotkeys from "../src/UI/Base/Hotkeys"
import { QueryParameters } from "../src/Logic/Web/QueryParameters"
import Link from "../src/UI/Base/Link"
import Constants from "../src/Models/Constants"
import LayerConfig from "../src/Models/ThemeConfig/LayerConfig"
import DependencyCalculator from "../src/Models/ThemeConfig/DependencyCalculator"
import { AllSharedLayers } from "../src/Customizations/AllSharedLayers"
import ThemeViewState from "../src/Models/ThemeViewState"
import Validators from "../src/UI/InputElement/Validators"
import questions from "../src/assets/generated/layers/questions.json"
import { LayerConfigJson } from "../src/Models/ThemeConfig/Json/LayerConfigJson"
import { Utils } from "../src/Utils"
import { TagUtils } from "../src/Logic/Tags/TagUtils"

function WriteFile(
    filename,
    html: string | BaseUIElement,
    autogenSource: string[],
    options?: {
        noTableOfContents: boolean
    }
): void {
    if (!html) {
        return
    }
    for (const source of autogenSource) {
        if (source.indexOf("*") > 0) {
            continue
        }
        if (!existsSync(source)) {
            throw (
                "While creating a documentation file and checking that the generation sources are properly linked: source file " +
                source +
                " was not found. Typo?"
            )
        }
    }

    if (html instanceof Combine && !options?.noTableOfContents) {
        const toc = new TableOfContents(html)
        const els = html.getElements()
        html = new Combine([els.shift(), toc, ...els]).SetClass("flex flex-col")
    }

    let md = new Combine([
        Translations.W(html),
        "\n\nThis document is autogenerated from " +
            autogenSource
                .map(
                    (file) =>
                        `[${file}](https://github.com/pietervdvn/MapComplete/blob/develop/${file})`
                )
                .join(", "),
    ]).AsMarkdown()

    md.replace(/\n\n\n+/g, "\n\n")

    if (!md.endsWith("\n")) {
        md += "\n"
    }

    const warnAutomated =
        "[//]: # (WARNING: this file is automatically generated. Please find the sources at the bottom and edit those sources)"

    writeFileSync(filename, warnAutomated + md)
}

function GenerateDocumentationForTheme(theme: LayoutConfig): BaseUIElement {
    return new Combine([
        new Title(
            new Combine([
                theme.title,
                "(",
                new Link(theme.id, "https://mapcomplete.osm.be/" + theme.id),
                ")",
            ]),
            2
        ),
        theme.description,
        "This theme contains the following layers:",
        new List(
            theme.layers
                .filter((l) => !l.id.startsWith("note_import_"))
                .map((l) => new Link(l.id, "../Layers/" + l.id + ".md"))
        ),
        "Available languages:",
        new List(theme.language.filter((ln) => ln !== "_context")),
    ]).SetClass("flex flex-col")
}

/**
 * Generates the documentation for the layers overview page
 * @constructor
 */
function GenLayerOverviewText(): BaseUIElement {
    for (const id of Constants.priviliged_layers) {
        if (!AllSharedLayers.sharedLayers.has(id)) {
            console.error("Priviliged layer definition not found: " + id)
            return undefined
        }
    }

    const allLayers: LayerConfig[] = Array.from(AllSharedLayers.sharedLayers.values()).filter(
        (layer) => layer["source"] === null
    )

    const builtinLayerIds: Set<string> = new Set<string>()
    allLayers.forEach((l) => builtinLayerIds.add(l.id))

    const themesPerLayer = new Map<string, string[]>()

    for (const layout of Array.from(AllKnownLayouts.allKnownLayouts.values())) {
        for (const layer of layout.layers) {
            if (!builtinLayerIds.has(layer.id)) {
                continue
            }
            if (!themesPerLayer.has(layer.id)) {
                themesPerLayer.set(layer.id, [])
            }
            themesPerLayer.get(layer.id).push(layout.id)
        }
    }

    // Determine the cross-dependencies
    const layerIsNeededBy: Map<string, string[]> = new Map<string, string[]>()

    for (const layer of allLayers) {
        for (const dep of DependencyCalculator.getLayerDependencies(layer)) {
            const dependency = dep.neededLayer
            if (!layerIsNeededBy.has(dependency)) {
                layerIsNeededBy.set(dependency, [])
            }
            layerIsNeededBy.get(dependency).push(layer.id)
        }
    }

    return new Combine([
        new Title("Special and other useful layers", 1),
        "MapComplete has a few data layers available in the theme which have special properties through builtin-hooks. Furthermore, there are some normal layers (which are built from normal Theme-config files) but are so general that they get a mention here.",
        new Title("Priviliged layers", 1),
        new List(Constants.priviliged_layers.map((id) => "[" + id + "](#" + id + ")")),
        ...Utils.NoNull(
            Constants.priviliged_layers.map((id) => AllSharedLayers.sharedLayers.get(id))
        ).map((l) =>
            l.GenerateDocumentation(
                themesPerLayer.get(l.id),
                layerIsNeededBy,
                DependencyCalculator.getLayerDependencies(l),
                Constants.added_by_default.indexOf(<any>l.id) >= 0,
                Constants.no_include.indexOf(<any>l.id) < 0
            )
        ),
        new Title("Normal layers", 1),
        "The following layers are included in MapComplete:",
        new List(
            Array.from(AllSharedLayers.sharedLayers.keys()).map(
                (id) => new Link(id, "./Layers/" + id + ".md")
            )
        ),
    ])
}

/**
 * Generates documentation for the layers.
 * Inline layers are included (if the theme is public)
 * @param callback
 * @constructor
 */
function GenOverviewsForSingleLayer(
    callback: (layer: LayerConfig, element: BaseUIElement, inlineSource: string) => void
): void {
    const allLayers: LayerConfig[] = Array.from(AllSharedLayers.sharedLayers.values()).filter(
        (layer) => layer["source"] !== null
    )
    const builtinLayerIds: Set<string> = new Set<string>()
    allLayers.forEach((l) => builtinLayerIds.add(l.id))
    const inlineLayers = new Map<string, string>()

    for (const layout of Array.from(AllKnownLayouts.allKnownLayouts.values())) {
        if (layout.hideFromOverview) {
            continue
        }

        for (const layer of layout.layers) {
            if (layer.source === null) {
                continue
            }
            if (builtinLayerIds.has(layer.id)) {
                continue
            }
            if (layer.source.geojsonSource !== undefined) {
                // Not an OSM-source
                continue
            }
            allLayers.push(layer)
            builtinLayerIds.add(layer.id)
            inlineLayers.set(layer.id, layout.id)
        }
    }

    const themesPerLayer = new Map<string, string[]>()

    for (const layout of Array.from(AllKnownLayouts.allKnownLayouts.values())) {
        if (layout.hideFromOverview) {
            continue
        }
        for (const layer of layout.layers) {
            if (!builtinLayerIds.has(layer.id)) {
                // This is an inline layer
                continue
            }
            if (!themesPerLayer.has(layer.id)) {
                themesPerLayer.set(layer.id, [])
            }
            themesPerLayer.get(layer.id).push(layout.id)
        }
    }

    // Determine the cross-dependencies
    const layerIsNeededBy: Map<string, string[]> = new Map<string, string[]>()

    for (const layer of allLayers) {
        for (const dep of DependencyCalculator.getLayerDependencies(layer)) {
            const dependency = dep.neededLayer
            if (!layerIsNeededBy.has(dependency)) {
                layerIsNeededBy.set(dependency, [])
            }
            layerIsNeededBy.get(dependency).push(layer.id)
        }
    }

    allLayers.forEach((layer) => {
        const element = layer.GenerateDocumentation(
            themesPerLayer.get(layer.id),
            layerIsNeededBy,
            DependencyCalculator.getLayerDependencies(layer)
        )
        callback(layer, element, inlineLayers.get(layer.id))
    })
}

/**
 * The wikitable is updated as some tools show an overview of apps based on the wiki.
 */
function generateWikipage() {
    function generateWikiEntry(layout: {
        hideFromOverview: boolean
        id: string
        shortDescription: any
    }) {
        if (layout.hideFromOverview) {
            return ""
        }

        const languagesInDescr = Array.from(Object.keys(layout.shortDescription)).filter(
            (k) => k !== "_context"
        )
        const languages = languagesInDescr.map((ln) => `{{#language:${ln}|en}}`).join(", ")
        let auth = "Yes"
        return `{{service_item
|name= [https://mapcomplete.osm.be/${layout.id} ${layout.id}]
|region= Worldwide
|lang= ${languages}
|descr= A MapComplete theme: ${Translations.T(layout.shortDescription)
            .textFor("en")
            .replace("<a href='", "[[")
            .replace(/'>.*<\/a>/, "]]")}
|material= {{yes|[https://mapcomplete.osm.be/ ${auth}]}}
|image= MapComplete_Screenshot.png
|genre= POI, editor, ${layout.id}
}}`
    }

    let wikiPage =
        '{|class="wikitable sortable"\n' +
        "! Name, link !! Genre !! Covered region !! Language !! Description !! Free materials !! Image\n" +
        "|-"

    for (const layout of themeOverview) {
        if (layout.hideFromOverview) {
            continue
        }
        wikiPage += "\n" + generateWikiEntry(layout)
    }

    wikiPage += "\n|}"

    writeFile("Docs/wikiIndex.txt", wikiPage, (err) => {
        if (err !== null) {
            console.log("Could not save wikiindex", err)
        }
    })
}

console.log("Starting documentation generation...")
ScriptUtils.fixUtils()
generateWikipage()

GenOverviewsForSingleLayer((layer, element, inlineSource) => {
    ScriptUtils.erasableLog("Exporting layer documentation for", layer.id)
    if (!existsSync("./Docs/Layers")) {
        mkdirSync("./Docs/Layers")
    }
    let source: string = `assets/layers/${layer.id}/${layer.id}.json`
    if (inlineSource !== undefined) {
        source = `assets/themes/${inlineSource}/${inlineSource}.json`
    }
    WriteFile("./Docs/Layers/" + layer.id + ".md", element, [source], { noTableOfContents: true })
})

Array.from(AllKnownLayouts.allKnownLayouts.values()).map((theme) => {
    if (!existsSync("./Docs/Themes")) {
        mkdirSync("./Docs/Themes")
    }
    const docs = GenerateDocumentationForTheme(theme)
    WriteFile(
        "./Docs/Themes/" + theme.id + ".md",
        docs,
        [`assets/themes/${theme.id}/${theme.id}.json`],
        { noTableOfContents: true }
    )
})
WriteFile("./Docs/SpecialRenderings.md", SpecialVisualizations.HelpMessage(), [
    "src/UI/SpecialVisualizations.ts",
])
WriteFile(
    "./Docs/CalculatedTags.md",
    new Combine([
        new Title("Metatags", 1),
        SimpleMetaTaggers.HelpText(),
        ExtraFunctions.HelpText(),
    ]).SetClass("flex-col"),
    ["src/Logic/SimpleMetaTagger.ts", "src/Logic/ExtraFunctions.ts"]
)
WriteFile("./Docs/SpecialInputElements.md", Validators.HelpText(), [
    "src/UI/InputElement/Validators.ts",
])
WriteFile("./Docs/BuiltinLayers.md", GenLayerOverviewText(), [
    "src/Customizations/AllKnownLayouts.ts",
])

const qLayer = new LayerConfig(<LayerConfigJson>questions, "questions.json", true)
WriteFile("./Docs/BuiltinQuestions.md", qLayer.GenerateDocumentation([], new Map(), []), [
    "assets/layers/questions/questions.json",
])
WriteFile("./Docs/Tags_format.md", TagUtils.generateDocs(), ["src/Logic/Tags/TagUtils.ts"])

{
    // Generate the builtinIndex which shows interlayer dependencies
    var layers = ScriptUtils.getLayerFiles().map((f) => f.parsed)
    var builtinsPerLayer = new Map<string, string[]>()
    var layersUsingBuiltin = new Map<string /* Builtin */, string[]>()
    for (const layer of layers) {
        if (layer.tagRenderings === undefined) {
            continue
        }
        const usedBuiltins: string[] = []
        for (const tagRendering of layer.tagRenderings) {
            if (typeof tagRendering === "string") {
                usedBuiltins.push(tagRendering)
                continue
            }
            if (tagRendering["builtin"] !== undefined) {
                const builtins = tagRendering["builtin"]
                if (typeof builtins === "string") {
                    usedBuiltins.push(builtins)
                } else {
                    usedBuiltins.push(...builtins)
                }
            }
        }
        for (const usedBuiltin of usedBuiltins) {
            const usingLayers = layersUsingBuiltin.get(usedBuiltin)
            if (usingLayers === undefined) {
                layersUsingBuiltin.set(usedBuiltin, [layer.id])
            } else {
                usingLayers.push(layer.id)
            }
        }

        builtinsPerLayer.set(layer.id, usedBuiltins)
    }

    const docs = new Combine([
        new Title("Index of builtin TagRendering", 1),
        new Title("Existing builtin tagrenderings", 2),
        ...Array.from(layersUsingBuiltin.entries()).map(([builtin, usedByLayers]) =>
            new Combine([new Title(builtin), new List(usedByLayers)]).SetClass("flex flex-col")
        ),
    ]).SetClass("flex flex-col")
    WriteFile("./Docs/BuiltinIndex.md", docs, ["assets/layers/*.json"])
}

WriteFile("./Docs/URL_Parameters.md", QueryParameterDocumentation.GenerateQueryParameterDocs(), [
    "src/Logic/Web/QueryParameters.ts",
    "src/UI/QueryParameterDocumentation.ts",
])
if (fakedom === undefined) {
    throw "FakeDom not initialized"
}
QueryParameters.GetQueryParameter(
    "mode",
    "map",
    "The mode the application starts in, e.g. 'map', 'dashboard' or 'statistics'"
)

{
    new ThemeViewState(new LayoutConfig(<any>bookcases))
    WriteFile("./Docs/Hotkeys.md", Hotkeys.generateDocumentation(), [])
}
console.log("Generated docs")

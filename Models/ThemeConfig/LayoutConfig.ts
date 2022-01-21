import {Translation} from "../../UI/i18n/Translation";
import {LayoutConfigJson} from "./Json/LayoutConfigJson";
import LayerConfig from "./LayerConfig";
import {LayerConfigJson} from "./Json/LayerConfigJson";
import Constants from "../Constants";
import TilesourceConfig from "./TilesourceConfig";

export default class LayoutConfig {
    public readonly id: string;
    public readonly maintainer: string;
    public readonly credits?: string;
    public readonly version: string;
    public readonly language: string[];
    public readonly title: Translation;
    public readonly shortDescription: Translation;
    public readonly description: Translation;
    public readonly descriptionTail?: Translation;
    public readonly icon: string;
    public readonly socialImage?: string;
    public readonly startZoom: number;
    public readonly startLat: number;
    public readonly startLon: number;
    public readonly widenFactor: number;
    public readonly defaultBackgroundId?: string;
    public layers: LayerConfig[];
    public tileLayerSources: TilesourceConfig[]
    public readonly clustering?: {
        maxZoom: number,
        minNeededElements: number,
    };
    public readonly hideFromOverview: boolean;
    public lockLocation: boolean | [[number, number], [number, number]];
    public readonly enableUserBadge: boolean;
    public readonly enableShareScreen: boolean;
    public readonly enableMoreQuests: boolean;
    public readonly enableAddNewPoints: boolean;
    public readonly enableLayers: boolean;
    public readonly enableSearch: boolean;
    public readonly enableGeolocation: boolean;
    public readonly enableBackgroundLayerSelection: boolean;
    public readonly enableShowAllQuestions: boolean;
    public readonly enableExportButton: boolean;
    public readonly enablePdfDownload: boolean;
    public readonly enableIframePopout: boolean;

    public readonly customCss?: string;

    public readonly overpassUrl: string[];
    public readonly overpassTimeout: number;
    public readonly overpassMaxZoom: number
    public readonly osmApiTileSize: number
    public readonly official: boolean;

    constructor(json: LayoutConfigJson, official = true, context?: string) {
        this.official = official;
        this.id = json.id;
        if(official){
            if(json.id.toLowerCase() !== json.id){
                throw "The id of a theme should be lowercase: "+json.id
            }
            if(json.id.match(/[a-z0-9-_]/) == null){
                throw "The id of a theme should match [a-z0-9-_]*: "+json.id
            }
        }
        context = (context ?? "") + "." + this.id;
        this.maintainer = json.maintainer;
        this.credits = json.credits;
        this.version = json.version;
        this.language = [];

        if (typeof json.language === "string") {
            this.language = [json.language];
        } else {
            this.language = json.language;
        }
        {
            if (this.language.length == 0) {
                throw `No languages defined. Define at least one language. (${context}.languages)`
            }
            if (json.title === undefined) {
                throw "Title not defined in " + this.id;
            }
            if (json.description === undefined) {
                throw "Description not defined in " + this.id;
            }
            if (json.widenFactor <= 0) {
                throw "Widenfactor too small, shoud be > 0"
            }
            if (json.widenFactor > 20) {
                throw "Widenfactor is very big, use a value between 1 and 5 (current value is " + json.widenFactor + ") at " + context
            }
            if (json["hideInOverview"]) {
                throw "The json for " + this.id + " contains a 'hideInOverview'. Did you mean hideFromOverview instead?"
            }
            if (json.layers === undefined) {
                throw "Got undefined layers for " + json.id + " at " + context
            }
        }
        this.title = new Translation(json.title, context + ".title");
        this.description = new Translation(json.description, context + ".description");
        this.shortDescription = json.shortDescription === undefined ? this.description.FirstSentence() : new Translation(json.shortDescription, context + ".shortdescription");
        this.descriptionTail = json.descriptionTail === undefined ? undefined : new Translation(json.descriptionTail, context + ".descriptionTail");
        this.icon = json.icon;
        this.socialImage = json.socialImage;
        if(this.socialImage === null || this.socialImage === "" || this.socialImage === undefined){
            if(official){
                throw "Theme "+json.id+" has no social image defined"
            }
        }
        this.startZoom = json.startZoom;
        this.startLat = json.startLat;
        this.startLon = json.startLon;
        this.widenFactor = json.widenFactor ?? 1.5;

        this.defaultBackgroundId = json.defaultBackgroundId;
        this.tileLayerSources = (json.tileLayerSources ?? []).map((config, i) => new TilesourceConfig(config, `${this.id}.tileLayerSources[${i}]`))
        // At this point, layers should be expanded and validated either by the generateScript or the LegacyJsonConvert
        this.layers = json.layers.map(lyrJson => new LayerConfig(<LayerConfigJson>lyrJson, json.id + ".layers." + lyrJson["id"], official));


        this.clustering = {
            maxZoom: 16,
            minNeededElements: 25,
        };
        if (json.clustering === false) {
            this.clustering = {
                maxZoom: 0,
                minNeededElements: 100000,
            };
        } else if (json.clustering) {
            this.clustering = {
                maxZoom: json.clustering.maxZoom ?? 18,
                minNeededElements: json.clustering.minNeededElements ?? 25,
            }
        }

        this.hideFromOverview = json.hideFromOverview ?? false;
        this.lockLocation = <[[number, number], [number, number]]>json.lockLocation ?? undefined;
        this.enableUserBadge = json.enableUserBadge ?? true;
        this.enableShareScreen = json.enableShareScreen ?? true;
        this.enableMoreQuests = json.enableMoreQuests ?? true;
        this.enableLayers = json.enableLayers ?? true;
        this.enableSearch = json.enableSearch ?? true;
        this.enableGeolocation = json.enableGeolocation ?? true;
        this.enableAddNewPoints = json.enableAddNewPoints ?? true;
        this.enableBackgroundLayerSelection = json.enableBackgroundLayerSelection ?? true;
        this.enableShowAllQuestions = json.enableShowAllQuestions ?? false;
        this.enableExportButton = json.enableDownload ?? false;
        this.enablePdfDownload = json.enablePdfDownload ?? false;
        this.enableIframePopout = json.enableIframePopout ?? true
        this.customCss = json.customCss;
        this.overpassUrl = Constants.defaultOverpassUrls
        if (json.overpassUrl !== undefined) {
            if (typeof json.overpassUrl === "string") {
                this.overpassUrl = [json.overpassUrl]
            } else {
                this.overpassUrl = json.overpassUrl
            }
        }
        this.overpassTimeout = json.overpassTimeout ?? 30
        this.overpassMaxZoom = json.overpassMaxZoom ?? 16
        this.osmApiTileSize = json.osmApiTileSize ?? this.overpassMaxZoom + 1

    }

    public CustomCodeSnippets(): string[] {
        if (this.official) {
            return [];
        }
        const msg = "<br/><b>This layout uses <span class='alert'>custom javascript</span>, loaded for the wide internet. The code is printed below, please report suspicious code on the issue tracker of MapComplete:</b><br/>"
        const custom = [];
        for (const layer of this.layers) {
            custom.push(...layer.CustomCodeSnippets().map(code => code + "<br />"))
        }
        if (custom.length === 0) {
            return custom;
        }
        custom.splice(0, 0, msg);
        return custom;
    }

    public ExtractImages(): Set<string> {
        const icons = new Set<string>()
        for (const layer of this.layers) {
            layer.ExtractImages().forEach(icons.add, icons)
        }
        icons.add(this.icon)
        icons.add(this.socialImage)
        return icons
    }

    /**
     * Replaces all the relative image-urls with a fixed image url
     * This is to fix loading from external sources
     *
     * It should be passed the location where the original theme file is hosted.
     *
     * If no images are rewritten, the same object is returned, otherwise a new copy is returned
     */
    public patchImages(originalURL: string, originalJson: string): LayoutConfig {
        const allImages = Array.from(this.ExtractImages())
        const rewriting = new Map<string, string>()

        // Needed for absolute urls: note that it doesn't contain a trailing slash
        const origin = new URL(originalURL).origin
        let path = new URL(originalURL).href
        path = path.substring(0, path.lastIndexOf("/"))
        for (const image of allImages) {
            if (image == "" || image == undefined) {
                continue
            }
            if (image.startsWith("http://") || image.startsWith("https://")) {
                continue
            }
            if (image.startsWith("/")) {
                // This is an absolute path
                rewriting.set(image, origin + image)
            } else if (image.startsWith("./assets/themes")) {
                // Legacy workaround
                rewriting.set(image, path + image.substring(image.lastIndexOf("/")))
            } else if (image.startsWith("./")) {
                // This is a relative url
                rewriting.set(image, path + image.substring(1))
            } else {
                // This is a relative URL with only the path
                rewriting.set(image, path + image)
            }
        }
        if (rewriting.size == 0) {
            return this;
        }
        rewriting.forEach((value, key) => {
            console.log("Rewriting", key, "==>", value)
            originalJson = originalJson.replace(new RegExp(key, "g"), value)
        })
        return new LayoutConfig(JSON.parse(originalJson), false, "Layout rewriting")
    }

    public isLeftRightSensitive() {
        return this.layers.some(l => l.isLeftRightSensitive())
    }

    public getMatchingLayer(tags: any): LayerConfig | undefined {
        if (tags === undefined) {
            return undefined
        }
        for (const layer of this.layers) {
            if (layer.source.osmTags.matchesProperties(tags)) {
                return layer
            }
        }
        return undefined
    }

}
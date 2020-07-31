import {UserBadge} from "./UI/UserBadge";
import {CenterMessageBox} from "./UI/CenterMessageBox";
import {TagUtils} from "./Logic/TagsFilter";
import {LayerUpdater} from "./Logic/LayerUpdater";
import {FullScreenMessageBoxHandler} from "./UI/FullScreenMessageBoxHandler";
import {FeatureInfoBox} from "./UI/FeatureInfoBox";
import {SimpleAddUI} from "./UI/SimpleAddUI";
import {SearchAndGo} from "./UI/SearchAndGo";
import {AllKnownLayouts} from "./Customizations/AllKnownLayouts";
import {Layout} from "./Customizations/Layout";
import {FixedUiElement} from "./UI/Base/FixedUiElement";
import {QueryParameters} from "./Logic/QueryParameters";
import {InitUiElements} from "./InitUiElements";
import {StrayClickHandler} from "./Logic/Leaflet/StrayClickHandler";
import {GeoLocationHandler} from "./Logic/Leaflet/GeoLocationHandler";
import {State} from "./State";
import {All} from "./Customizations/Layouts/All";
import {CustomLayers} from "./Logic/CustomLayers";


// --------------------- Special actions based on the parameters -----------------

// @ts-ignore
if (location.href.startsWith("http://buurtnatuur.be")) {
    // Reload the https version. This is important for the 'locate me' button
    window.location.replace("https://buurtnatuur.be");
}

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    // Set to true if testing and changes should NOT be saved
    const testing = QueryParameters.GetQueryParameter("test", "true");
    testing.setData(testing.data ?? "true")
    // If you have a testfile somewhere, enable this to spoof overpass
    // This should be hosted independantly, e.g. with `cd assets; webfsd -p 8080` + a CORS plugin to disable cors rules
    //Overpass.testUrl = "http://127.0.0.1:8080/streetwidths.geojson";
}


// ----------------- SELECT THE RIGHT QUESTSET -----------------

let defaultLayout = "bookcases"

const path = window.location.pathname.split("/").slice(-1)[0];
if (path !== "index.html") {
    defaultLayout = path.substr(0, path.length - 5);
    console.log("Using", defaultLayout)
}

// Run over all questsets. If a part of the URL matches a searched-for part in the layout, it'll take that as the default
for (const k in AllKnownLayouts.allSets) {
    const layout = AllKnownLayouts.allSets[k];
    const possibleParts = layout.locationContains ?? [];
    for (const locationMatch of possibleParts) {
        if (locationMatch === "") {
            continue
        }
        if (window.location.href.toLowerCase().indexOf(locationMatch.toLowerCase()) >= 0) {
            defaultLayout = layout.name;
        }
    }
}

defaultLayout = QueryParameters.GetQueryParameter("layout", defaultLayout).data;

const layoutToUse: Layout = AllKnownLayouts.allSets[defaultLayout] ?? AllKnownLayouts["all"];
if (layoutToUse === undefined) {
    console.log("Incorrect layout")
    new FixedUiElement("Error: incorrect layout " + defaultLayout + "<a href='https://pietervdvn.github.io/MapComplete/index.html'>Go to MapComplete</a>").AttachTo("centermessage").onClick(() => {
    });
    throw "Incorrect layout"
}

console.log("Using layout: ", layoutToUse.name);

State.state = new State(layoutToUse);

function setupAllLayerElements() {

// ------------- Setup the layers -------------------------------

    const layerSetup = InitUiElements.InitLayers();

    const layerUpdater = new LayerUpdater(layerSetup.minZoom, layoutToUse.widenFactor, layerSetup.flayers);
    InitUiElements.InitLayerSelection(layerSetup)


// ------------------ Setup various other UI elements ------------


    InitUiElements.OnlyIf(State.state.featureSwitchAddNew, () => {
        new StrayClickHandler(() => {
                return new SimpleAddUI(
                    layerUpdater.runningQuery,
                    layerSetup.presets);
            }
        );
    });

    new CenterMessageBox(
        layerSetup.minZoom,
        layerUpdater.runningQuery)
        .AttachTo("centermessage");

}

setupAllLayerElements();

if (layoutToUse === AllKnownLayouts.allSets[CustomLayers.NAME]) {
    State.state.favourteLayers.addCallback((favs) => {
        for (const fav of favs) {
            const layer = AllKnownLayouts.allLayers[fav];
            if (!!layer) {
                layoutToUse.layers.push(layer);
            }
            setupAllLayerElements();
        }
    })
}


/**
 * Show the questions and information for the selected element
 * This is given to the div which renders fullscreen on mobile devices
 */
State.state.selectedElement.addCallback((feature) => {
    if (feature?.feature?.properties === undefined) {
        return;
    }
    const data = feature.feature.properties;
    // Which is the applicable set?
    for (const layer of layoutToUse.layers) {

        const applicable = layer.overpassFilter.matches(TagUtils.proprtiesToKV(data));
        if (applicable) {
            // This layer is the layer that gives the questions

            const featureBox = new FeatureInfoBox(
                feature.feature,
                State.state.allElements.getElement(data.id),
                layer.title,
                layer.elementsToShow,
            );

            State.state.fullScreenMessage.setData(featureBox);
            break;
        }
    }
    }
);

InitUiElements.OnlyIf(State.state.featureSwitchUserbadge, () => {
    new UserBadge().AttachTo('userbadge');
});

InitUiElements.OnlyIf((State.state.featureSwitchSearch), () => {
    new SearchAndGo().AttachTo("searchbox");
});

new FullScreenMessageBoxHandler(() => {
    State.state.selectedElement.setData(undefined)
}).update();

InitUiElements.OnlyIf(State.state.featureSwitchWelcomeMessage, () => {
    InitUiElements.InitWelcomeMessage()
});

if ((window != window.top && !State.state.featureSwitchWelcomeMessage) || State.state.featureSwitchIframe.data) {
    new FixedUiElement(`<a href='${window.location}' target='_blank'><span class='iframe-escape'><img src='assets/pop-out.svg'></span></a>`).AttachTo("top-right")
}



new GeoLocationHandler().AttachTo("geolocate-button");


State.state.osmConnection.registerActivateOsmAUthenticationClass();
State.state.locationControl.ping()


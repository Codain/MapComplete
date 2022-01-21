import {UIEventSource} from "../UIEventSource";
import Translations from "../../UI/i18n/Translations";
import Locale from "../../UI/i18n/Locale";
import TagRenderingAnswer from "../../UI/Popup/TagRenderingAnswer";
import Combine from "../../UI/Base/Combine";
import LayoutConfig from "../../Models/ThemeConfig/LayoutConfig";
import {ElementStorage} from "../ElementStorage";
import {Utils} from "../../Utils";

export default class TitleHandler {
    constructor(state: {
        selectedElement: UIEventSource<any>,
        layoutToUse: LayoutConfig,
        allElements: ElementStorage
    }) {
        const currentTitle: UIEventSource<string> = state.selectedElement.map(
            selected => {
                const layout = state.layoutToUse
                const defaultTitle = Translations.WT(layout?.title)?.txt ?? "MapComplete"

                if (selected === undefined) {
                    return defaultTitle
                }

                const tags = selected.properties;
                for (const layer of layout.layers) {
                    if (layer.title === undefined) {
                        continue;
                    }
                    if (layer.source.osmTags.matchesProperties(tags)) {
                        const tagsSource = state.allElements.getEventSourceById(tags.id) ?? new UIEventSource<any>(tags)
                        const title = new TagRenderingAnswer(tagsSource, layer.title, {})
                        return new Combine([defaultTitle, " | ", title]).ConstructElement()?.innerText ?? defaultTitle;
                    }
                }
                return defaultTitle
            }, [Locale.language]
        )


        currentTitle.addCallbackAndRunD(title => {
            if (Utils.runningFromConsole) {
                return
            }
            document.title = title
        })
    }
}
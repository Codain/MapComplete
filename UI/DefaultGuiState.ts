import {UIEventSource} from "../Logic/UIEventSource";
import {QueryParameters} from "../Logic/Web/QueryParameters";
import Hash from "../Logic/Web/Hash";

export class DefaultGuiState {
    static state: DefaultGuiState;
    public readonly welcomeMessageIsOpened: UIEventSource<boolean>;
    public readonly downloadControlIsOpened: UIEventSource<boolean>;
    public readonly filterViewIsOpened: UIEventSource<boolean>;
    public readonly copyrightViewIsOpened: UIEventSource<boolean>;
    public readonly currentViewControlIsOpened: UIEventSource<boolean>;
    public readonly welcomeMessageOpenedTab: UIEventSource<number>
    public readonly allFullScreenStates: UIEventSource<boolean>[] = []

    constructor() {


        this.welcomeMessageOpenedTab = UIEventSource.asFloat(QueryParameters.GetQueryParameter(
            "tab",
            "0",
            `The tab that is shown in the welcome-message.`
        ));
        this.welcomeMessageIsOpened = QueryParameters.GetBooleanQueryParameter(
            "welcome-control-toggle",
            "false",
            "Whether or not the welcome panel is shown"
        )
        this.downloadControlIsOpened = QueryParameters.GetBooleanQueryParameter(
            "download-control-toggle",
            "false",
            "Whether or not the download panel is shown"
        )
        this.filterViewIsOpened = QueryParameters.GetBooleanQueryParameter(
            "filter-toggle",
            "false",
            "Whether or not the filter view is shown"
        )
        this.copyrightViewIsOpened = QueryParameters.GetBooleanQueryParameter(
            "copyright-toggle",
            "false",
            "Whether or not the copyright view is shown"
        )
        this.currentViewControlIsOpened = QueryParameters.GetBooleanQueryParameter(
            "currentview-toggle",
            "false",
            "Whether or not the current view box is shown"
        )
        const states = {
            download: this.downloadControlIsOpened,
            filters: this.filterViewIsOpened,
            copyright: this.copyrightViewIsOpened,
            currentview: this.currentViewControlIsOpened,
            welcome: this.welcomeMessageIsOpened
        }
        Hash.hash.addCallbackAndRunD(hash => {
            hash = hash.toLowerCase()
            states[hash]?.setData(true)
        })
       
        if (Hash.hash.data === "" || Hash.hash.data === undefined) {
            this.welcomeMessageIsOpened.setData(true)
        }

        this.allFullScreenStates.push(this.downloadControlIsOpened, this.filterViewIsOpened, this.copyrightViewIsOpened, this.welcomeMessageIsOpened, this.currentViewControlIsOpened)

        for (let i = 0; i < this.allFullScreenStates.length; i++) {
            const fullScreenState = this.allFullScreenStates[i];
            for (let j = 0; j < this.allFullScreenStates.length; j++) {
                if (i == j) {
                    continue
                }
                const otherState = this.allFullScreenStates[j];
                fullScreenState.addCallbackAndRunD(isOpened => {
                    if (isOpened) {
                        otherState.setData(false)
                    }
                })
            }
        }

    }
}
import {Tag} from "../../Tags/Tag";
import {OsmCreateAction} from "./OsmChangeAction";
import {Changes} from "../Changes";
import {ChangeDescription} from "./ChangeDescription";
import {And} from "../../Tags/And";
import {OsmWay} from "../OsmObject";
import {GeoOperations} from "../../GeoOperations";

export default class CreateNewNodeAction extends OsmCreateAction {

    /**
     * Maps previously created points onto their assigned ID, to reuse the point if uplaoded
     * "lat,lon" --> id
     */
    private static readonly previouslyCreatedPoints = new Map<string, number>()
    public newElementId: string = undefined
    public newElementIdNumber: number = undefined
    private readonly _basicTags: Tag[];
    private readonly _lat: number;
    private readonly _lon: number;
    private readonly _snapOnto: OsmWay;
    private readonly _reusePointDistance: number;
    private meta: { changeType: "create" | "import"; theme: string };
    private readonly _reusePreviouslyCreatedPoint: boolean;

    constructor(basicTags: Tag[],
                lat: number, lon: number,
                options: {
                    allowReuseOfPreviouslyCreatedPoints?: boolean,
                    snapOnto?: OsmWay,
                    reusePointWithinMeters?: number,
                    theme: string, changeType: "create" | "import" | null
                }) {
        super(null,basicTags !== undefined && basicTags.length > 0)
        this._basicTags = basicTags;
        this._lat = lat;
        this._lon = lon;
        if (lat === undefined || lon === undefined) {
            throw "Lat or lon are undefined!"
        }
        this._snapOnto = options?.snapOnto;
        this._reusePointDistance = options?.reusePointWithinMeters ?? 1
        this._reusePreviouslyCreatedPoint = options?.allowReuseOfPreviouslyCreatedPoints ?? (basicTags.length === 0)
        this.meta = {
            theme: options.theme,
            changeType: options.changeType
        }
    }

    public static registerIdRewrites(mappings: Map<string, string>) {
        const toAdd: [string, number][] = []

        this.previouslyCreatedPoints.forEach((oldId, key) => {
            if (!mappings.has("node/" + oldId)) {
                return;
            }

            const newId = Number(mappings.get("node/" + oldId).substr("node/".length))
            toAdd.push([key, newId])
        })
        for (const [key, newId] of toAdd) {
            CreateNewNodeAction.previouslyCreatedPoints.set(key, newId)
        }
    }

    async CreateChangeDescriptions(changes: Changes): Promise<ChangeDescription[]> {
        if (this._reusePreviouslyCreatedPoint) {

            const key = this._lat + "," + this._lon
            const prev = CreateNewNodeAction.previouslyCreatedPoints
            if (prev.has(key)) {
                this.newElementIdNumber = prev.get(key)
                this.newElementId = "node/" + this.newElementIdNumber
                return []
            }
        }


        const id = changes.getNewID()
        const properties = {
            id: "node/" + id
        }
        this.setElementId(id)
        for (const kv of this._basicTags) {
            if (typeof kv.value !== "string") {
                throw "Invalid value: don't use a regex in a preset"
            }
            properties[kv.key] = kv.value;
        }

        const newPointChange: ChangeDescription = {
            tags: new And(this._basicTags).asChange(properties),
            type: "node",
            id: id,
            changes: {
                lat: this._lat,
                lon: this._lon
            },
            meta: this.meta
        }
        if (this._snapOnto === undefined) {
            return [newPointChange]
        }


        // Project the point onto the way

        const geojson = this._snapOnto.asGeoJson()
        const projected = GeoOperations.nearestPoint(geojson, [this._lon, this._lat])
        const index = projected.properties.index
        // We check that it isn't close to an already existing point
        let reusedPointId = undefined;
        const prev = <[number, number]>geojson.geometry.coordinates[index]
        if (GeoOperations.distanceBetween(prev, <[number, number]>projected.geometry.coordinates) < this._reusePointDistance) {
            // We reuse this point instead!
            reusedPointId = this._snapOnto.nodes[index]
        }
        const next = <[number, number]>geojson.geometry.coordinates[index + 1]
        if (GeoOperations.distanceBetween(next, <[number, number]>projected.geometry.coordinates) < this._reusePointDistance) {
            // We reuse this point instead!
            reusedPointId = this._snapOnto.nodes[index + 1]
        }
        if (reusedPointId !== undefined) {
            this.setElementId(reusedPointId)
            return [{
                tags: new And(this._basicTags).asChange(properties),
                type: "node",
                id: reusedPointId,
                meta: this.meta
            }]
        }

        const locations = [...this._snapOnto.coordinates]
        locations.forEach(coor => coor.reverse())
        const ids = [...this._snapOnto.nodes]

        locations.splice(index + 1, 0, [this._lon, this._lat])
        ids.splice(index + 1, 0, id)

        // Allright, we have to insert a new point in the way
        return [
            newPointChange,
            {
                type: "way",
                id: this._snapOnto.id,
                changes: {
                    coordinates: locations,
                    nodes: ids
                },
                meta: this.meta
            }
        ]
    }

    private setElementId(id: number) {
        this.newElementIdNumber = id;
        this.newElementId = "node/" + id
        if (!this._reusePreviouslyCreatedPoint) {
            return
        }
        const key = this._lat + "," + this._lon
        CreateNewNodeAction.previouslyCreatedPoints.set(key, id)
    }


}
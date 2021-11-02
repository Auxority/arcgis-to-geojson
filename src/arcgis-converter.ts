type Vector2D = [number, number];
type Line = [Vector2D, Vector2D];
type Ring = Vector2D[];
type GenericObject = {[index: string]: any};

interface Arcgis {
    features?: [];
    x?: number;
    y?: number;
    z?: number;
    points?: any;
    paths?: any;
    rings?: any;
    xmin?: number;
    ymin?: number;
    xmax?: number;
    ymax?: number;
    geometry?: any;
    attributes?: any;
    spatialReference?: any;
}

interface GeoJSON {
    type?: "FeatureCollection" | "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon" | "Feature";
    features?: GeoJSON[];
    coordinates?: Vector2D | Ring[] | Ring[][];
    geometry?: GeoJSON;
    properties?: GenericObject;
    id?: string;
}

export default class ArcgisConverter {
    public static toGeoJSON = (arcgis: Arcgis, idAttribute?: string): GeoJSON => {
        let geoJSON: GeoJSON = {};

        if (arcgis.features) {
            geoJSON.type = "FeatureCollection";
            geoJSON.features = arcgis.features.map((feature) => this.toGeoJSON(feature, idAttribute));
        }
    
        if (typeof arcgis.x === "number" && typeof arcgis.y === "number") {
            geoJSON.type = "Point";
            geoJSON.coordinates = [arcgis.x, arcgis.y];
            if (typeof arcgis.z === "number") {
                geoJSON.coordinates.push(arcgis.z);
            }
        }
    
        if (arcgis.points) {
            geoJSON.type = "MultiPoint";
            geoJSON.coordinates = arcgis.points.slice(0);
        }
    
        if (arcgis.paths) {
            if (arcgis.paths.length === 1) {
                geoJSON.type = "LineString";
                geoJSON.coordinates = arcgis.paths[0].slice(0);
            } else {
                geoJSON.type = "MultiLineString";
                geoJSON.coordinates = arcgis.paths.slice(0);
            }
        }
    
        if (arcgis.rings) {
            geoJSON = this.ringsToGeoJSON(arcgis.rings.slice(0));
        }
    
        if (
            typeof arcgis.xmin === "number" &&
            typeof arcgis.ymin === "number" &&
            typeof arcgis.xmax === "number" &&
            typeof arcgis.ymax === "number"
        ) {
            geoJSON.type = "Polygon";
            geoJSON.coordinates = [[
                [arcgis.xmax, arcgis.ymax],
                [arcgis.xmin, arcgis.ymax],
                [arcgis.xmin, arcgis.ymin],
                [arcgis.xmax, arcgis.ymin],
                [arcgis.xmax, arcgis.ymax]
            ]];
        }
    
        if (arcgis.geometry || arcgis.attributes) {
            geoJSON.type = "Feature";
            geoJSON.geometry = arcgis.geometry ? this.toGeoJSON(arcgis.geometry, idAttribute) : undefined;
            geoJSON.properties = arcgis.attributes ? this.shallowClone(arcgis.attributes) : undefined;
            if (arcgis.attributes) {
                geoJSON.id = this.getId(arcgis.attributes, idAttribute);
            }
        }
    
        if (geoJSON.geometry && Object.keys(geoJSON.geometry).length === 0) {
            geoJSON.geometry = undefined;
        }
    
        if (
            arcgis.spatialReference &&
            arcgis.spatialReference.wkid &&
            arcgis.spatialReference.wkid !== 4326
        ) {
            console.warn("Object converted in non-standard crs - " + JSON.stringify(arcgis.spatialReference));
        }
    
        return geoJSON;
    }

    private static vectorsEqual = (vectorA: Vector2D, vectorB: Vector2D): boolean => {
        return vectorA[0] === vectorB[0] && vectorA[1] === vectorB[1];
    }

    private static closeRing = (ring: Ring): Ring => {
        const firstVector: Vector2D = ring[0];
        const lastVector: Vector2D = ring[ring.length - 1];
        if (!this.vectorsEqual(firstVector, lastVector)) {
            ring.push(firstVector);
        }

        return ring;
    }

    private static isRingClockwise = (ring: Ring): boolean => {
        let total: number = 0;
        for (let i: number = 0; i < ring.length - 1; i++) {
            const vectorA: Vector2D = ring[i];
            const vectorB: Vector2D = ring[i + 1];
            total += (vectorB[0] - vectorA[0]) * (vectorB[1] + vectorA[1]);
        }
    
        return total >= 0;
    }

    private static doLinesIntersect = (lineA: Line, lineB: Line): boolean => {
        const [a1, a2]: Line = lineA;
        const [b1, b2]: Line = lineB;
    
        const uaT: number = (b2[0] - b1[0]) * (a1[1] - b1[1]) - (b2[1] - b1[1]) * (a1[0] - b1[0]);
        const ubT: number = (a2[0] - a1[0]) * (a1[1] - b1[1]) - (a2[1] - a1[1]) * (a1[0] - b1[0]);
        const uB: number = (b2[1] - b1[1]) * (a2[0] - a1[0]) - (b2[0] - b1[0]) * (a2[1] - a1[1]);
        if (uB !== 0) {
            const ua: number = uaT / uB;
            const ub: number = ubT / uB;
            return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
        }
    
        return false;
    }

    private static doRingsIntersect = (ringA: Ring, ringB: Ring): boolean => {
        for (let i: number = 0; i < ringA.length - 1; i++) {
            for (let j: number = 0; j < ringB.length - 1; j++) {
                const lineA: Line = [ringA[i], ringA[i + 1]];
                const lineB: Line = [ringB[j], ringB[j + 1]];
                if (this.doLinesIntersect(lineA, lineB)) {
                    return true;
                }
            }
        }

        return false;
    }

    private static doesRingContainVector = (ring: Ring, vector: Vector2D): boolean => {
        let inside = false;

        const [x, y] = vector;

        for (let i: number = 0, j: number = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi]: Vector2D = ring[i];
            const [xj, yj]: Vector2D = ring[j];

            const intersects: boolean = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersects) {
                inside = !inside;
            }
        }

        return inside;
    }

    private static ringContainsRing = (outerRing: Ring, innerRing: Ring): boolean => {
        return !this.doRingsIntersect(outerRing, innerRing)
            && this.doesRingContainVector(outerRing, innerRing[0]);
    }

    private static ringsToGeoJSON = (rings: Ring[]): GeoJSON => {
        const outerRings: Ring[][] = [];
        const holes: Ring[] = [];

        rings.forEach((rawRing: Ring) => {
            const ring: Ring = this.closeRing(rawRing);
            if (ring.length >= 4) {
                if (this.isRingClockwise(ring)) {
                    const polygon: Ring[] = [ring.slice().reverse()];
                    outerRings.push(polygon);
                } else {
                    holes.push(ring.slice().reverse());
                }
            }
        });

        const uncontainedHoles = [];
        while (holes.length > 0) {
            const hole: Ring = holes.pop() as Ring;
            let contained: boolean =  false;
            for (let i: number = outerRings.length - 1; i >= 0; i--) {
                const outerRing: Ring = outerRings[i][0];
                if (this.ringContainsRing(outerRing, hole)) {
                    outerRings[i].push(hole);
                    contained = true;
                    break;
                }
            }

            if (!contained) {
                uncontainedHoles.push(hole);
            }
        }

        while (uncontainedHoles.length > 0) {
            const hole: Ring = uncontainedHoles.pop() as Ring;
            let intersects = false;
            for (let i: number = outerRings.length - 1; i >= 0; i--) {
                const outerRing: Ring = outerRings[i][0];
                if (this.doRingsIntersect(outerRing, hole)) {
                    outerRings[i].push(hole);
                    intersects = true;
                    break;
                }
            }

            if (!intersects) {
                outerRings.push([hole.reverse()]);
            }
        }

        if (outerRings.length === 1) {
            return {
                type: "Polygon",
                coordinates: outerRings[0]
            }
        }
        return {
            type: "MultiPolygon",
            coordinates: outerRings
        }
    }

    private static shallowClone = (obj: GenericObject): GenericObject => {
        const target: GenericObject = {};
        for (let i in obj) {
            if (obj.hasOwnProperty(i)) {
                target[i] = obj[i];
            }
        }
        return target;
    }


    private static getId = (obj: {[index: string]: string}, key?: string): string | undefined => {
        const validKeys: string[] = key ? [key, "OBJECTID", "FID"] : ["OBJECTID", "FID"];
        for (let i: number = 0; i < validKeys.length; i++) {
            const currentKey: string = validKeys[i];
            if (currentKey in obj && (typeof obj[currentKey] === "string" || typeof obj[currentKey] === "number")) {
                return obj[currentKey];
            }
        }
        console.error("No valid id attribute found");
    }
}

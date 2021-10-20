import fs from "fs";
import ArcgisConverter from "./arcgis-converter";

const INPUT_PATH = "./input";
const OUTPUT_PATH = "./output";

const validateDirectory = (path: string) => {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
    return path;
}

const saveGeoJSONFile = (geoJSON: any, fileName: string) => {
    fs.writeFileSync(`${OUTPUT_PATH}/${fileName}`, JSON.stringify(geoJSON), {encoding: 'utf-8'});
}

const convertArcgisFile = (fileName: string) => {
    fs.readFile(`${INPUT_PATH}/${fileName}`, (err: NodeJS.ErrnoException | null, data: Buffer) => {
        if (err) {
            throw err;
        }

        const text: string = data.toString();
        const arcgisData = JSON.parse(text);
        const geoJSON = ArcgisConverter.toGeoJSON(arcgisData);
        saveGeoJSONFile(geoJSON, fileName);
    });
}

const convertArcgisFiles = () => {
    validateDirectory(INPUT_PATH);
    validateDirectory(OUTPUT_PATH);
    fs.readdir(INPUT_PATH, (err?: NodeJS.ErrnoException | null, fileNames?: string[]) => {
        if (err) {
            throw err;
        }
        
        if (fileNames) {
            fileNames.forEach(convertArcgisFile);
        }
    });
}

convertArcgisFiles();

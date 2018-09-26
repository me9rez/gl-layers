import { convertPoint, convertLine, convertLines } from './convert';

export default function convertGeometry(feature) {
    const type = feature.type;
    const geometry = [];
    if (type === 1) {
        //Point
        convertPoint(feature.geometry, geometry);
    } else if (type === 2) {
        //LineString
        convertLine(feature.geometry, geometry);
    } else if (type === 3) {
        //Polygon
        convertLines(feature.geometry, geometry);
    } else if (type === 4) {
        //MultiPoint
        for (let i = 0; i < feature.geometry.length; i++) {
            convertPoint(feature.geometry[i], geometry);
        }
    } else if (type === 5) {
        //MultiLineString
        convertLines(feature.geometry, geometry);
    } else if (type === 6) {
        //MultiPolygon
        for (let i = 0; i < feature.geometry.length; i++) {
            const polygon = [];
            convertLines(feature.geometry[i], polygon, true);
            geometry.push(polygon);
        }
    }
    feature.geometry = geometry;
    return feature;
}

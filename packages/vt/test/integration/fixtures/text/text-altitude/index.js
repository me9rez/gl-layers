const data = {
    type: 'FeatureCollection',
    features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0.5, 0.5, 20000] }, properties: { type: 1 } }
    ]
};

const style = [
    {
        renderPlugin: {
            type: 'text',
            dataConfig: {
                type: 'point',
                altitudeScale: 1,
                defaultAltitude: 0
            },
            sceneConfig: {
                collision: false
            }
        },
        symbol: {
            textName: '{height}'
        }
    }
];

module.exports = {
    style,
    data,
    view: {
        center: [0, 0],
        zoom: 7,
        pitch: 50
    }
};

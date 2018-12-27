import { compileStyle } from '@maptalks/feature-filter';
import { extend, getIndexArrayType } from '../../common/Util';
import { buildExtrudeFaces, buildWireframe } from '../builder/';
import { buildUniqueVertex, buildFaceNormals, buildShadowVolume } from '../builder/Build';
import { PolygonPack, NativeLinePack, LinePack, PointPack } from '@maptalks/vector-packer';
import Promise from '../../common/Promise';

const KEY_STYLE_IDX = '__style_idx';
const KEY_IDX = '__fea_idx';

export default class BaseLayerWorker {
    constructor(id, options, upload) {
        this.id = id;
        this.options = options;
        this.upload = upload;
        this._compileStyle(options.style || {});
    }

    updateStyle(style, cb) {
        this._compileStyle(style);
        cb();
    }

    /**
     * Load a tile, paint and return gl directives
     * @param {Object} tileInfo  - tileInfo, xyz, res, extent, etc
     * @param {Function} cb - callback function when finished
     */
    loadTile(context, cb) {
        this.getTileFeatures(context.tileInfo, (err, features) => {
            if (err) {
                cb(err);
                return;
            }
            if (!features || features.length === 0) {
                cb();
                return;
            }
            this._createTileData(features, context).then(data => {
                cb(null, data.data, data.buffers);
            });
        });
    }

    fetchIconGlyphs(icons, glyphs, cb) {
        //command, params, buffers and callback
        this.upload('fetchIconGlyphs', { icons, glyphs }, null, cb);
    }

    _createTileData(features, { glScale, zScale, tileInfo }) {
        const zoom = tileInfo.z,
            data = [],
            dataIndexes = [],
            options = this.options,
            buffers = [];
        const promises = [];
        for (let i = 0; i < this.pluginConfig.length; i++) {
            const pluginConfig = this.pluginConfig[i];
            const styles = pluginConfig.style;
            let all = true;
            //iterate plugin's styles and mark feature's style index
            for (let ii = 0, ll = styles.length; ii < ll; ii++) {
                all = this._filterFeatures(styles[ii].filter, features, i, ii);
                if (all) {
                    //all features are filtered
                    break;
                }
            }

            const filteredFeas = [];
            //only save feature's indexes, and restore features in renderer
            //[feature index, style index, feature index, style index, ....]
            const styledFeatures = [];
            let maxIndex = 0;
            let feature;
            for (let ii = 0, ll = features.length; ii < ll; ii++) {
                feature = features[ii];
                delete feature[KEY_STYLE_IDX];
                if (feature.styleMark && feature.styleMark[i] !== undefined) {
                    const styleIdx = feature.styleMark[i];
                    //vector-packer 中会读取 style_idx，能省略掉 style 遍历逻辑
                    //KEY_STYLE_IDX中的值会在下次循环被替换掉，必须保证createTileGeometry不是在异步逻辑中读取的KEY_STYLE_IDX
                    feature[KEY_STYLE_IDX] = styleIdx;
                    feature[KEY_IDX] = ii;
                    filteredFeas.push(feature);
                    styledFeatures.push(ii, styleIdx);
                    maxIndex = Math.max(ii, styleIdx, maxIndex);
                }
            }

            if (filteredFeas.length === 0) {
                continue;
            }

            const arrCtor = getIndexArrayType(maxIndex);
            data[i] = {
                //[feature_index, style_index, ...]
                styledFeatures : new arrCtor(styledFeatures)
            };
            //index of plugin with data
            dataIndexes.push(i);
            buffers.push(data[i].styledFeatures.buffer);
            // const tileData = plugin.createTileDataInWorker(filteredFeas, this.options.extent);
            const promise = this._createTileGeometry(filteredFeas, pluginConfig.dataConfig, styles, { extent : options.extent, glScale, zScale, zoom });
            promises.push(promise);
        }

        return Promise.all(promises).then(tileDatas => {
            for (let i = 0; i < tileDatas.length; i++) {
                if (!tileDatas[i]) {
                    continue;
                }
                data[dataIndexes[i]].data = tileDatas[i].data;
                if (tileDatas[i].buffers && tileDatas[i].buffers.length) {
                    for (let ii = 0, ll = tileDatas[i].buffers.length; ii < ll; ii++) {
                        buffers.push(tileDatas[i].buffers[ii]);
                    }
                }
            }

            const allFeas = [];
            if (options.features) {
                let feature;
                for (let i = 0, l = features.length; i < l; i++) {
                    feature = features[i];
                    //reset feature's marks
                    if (feature && feature.styleMark) {
                        if (options.features === 'id') {
                            allFeas.push(feature.id);
                        } else {
                            allFeas.push(feature);
                        }
                        delete feature.styleMark;
                        delete feature[KEY_STYLE_IDX];
                        delete feature[KEY_IDX];
                    } else {
                        allFeas.push(null);
                    }
                }
            }

            return {
                data : {
                    data,
                    features : JSON.stringify(allFeas)
                },
                buffers
            };
        });

    }

    _createTileGeometry(features, dataConfig = {}, styles, { extent, glScale, zScale, zoom }) {
        const tileSize = this.options.tileSize[0];
        const type = dataConfig.type;
        if (type === '3d-extrusion') {
            return Promise.resolve(this._build3DExtrusion(features, dataConfig, extent, glScale, zScale));
        } else if (type === '3d-wireframe') {
            return Promise.resolve(this._buildWireframe(features, dataConfig, extent));
        } else if (type === 'point') {
            const options = extend({}, dataConfig, {
                EXTENT : extent,
                requestor : this.fetchIconGlyphs.bind(this),
                zoom
            });
            const pack = new PointPack(features, styles, options);
            return pack.load(extent / tileSize);
        } else if (type === 'line') {
            const options = extend({}, dataConfig, {
                EXTENT : extent,
                requestor : this.fetchIconGlyphs.bind(this),
                zoom
            });
            const pack = new LinePack(features, styles, options);
            return pack.load();
        } else if (type === 'native-line') {
            const options = extend({}, dataConfig, {
                EXTENT : extent,
                zoom
            });
            const pack = new NativeLinePack(features, styles, options);
            return pack.load();
        } else if (type === 'fill') {
            // debugger
            // //TODO 需要实现requestor，把数据返回给主线程绘制glyph，获取icon等
            const options = extend({}, dataConfig, {
                EXTENT : extent,
                requestor : this.fetchIconGlyphs.bind(this),
                zoom
            });
            const pack = new PolygonPack(features, styles, options);
            return pack.load();
        }
        return {
            data : {},
            buffers : null
        };
    }

    _build3DExtrusion(features, dataConfig, extent, glScale, zScale) {
        if (dataConfig.top === undefined) {
            dataConfig.top = true;
        }
        const {
            altitudeScale,
            altitudeProperty,
            defaultAltitude,
            heightProperty,
            defaultHeight,
            normal, tangent,
            uv, uvSize,
            shadowVolume, shadowDir,
            top
        } = dataConfig;
        const faces = buildExtrudeFaces(
            features, extent,
            {
                altitudeScale, altitudeProperty,
                defaultAltitude : defaultAltitude || 0,
                heightProperty,
                defaultHeight : defaultHeight || 0
            },
            {
                top,
                uv,
                uvSize : uvSize || [128, 128],
                //>> needed by uv computation
                glScale,
                //用于白模侧面的uv坐标v的计算
                // zScale用于将meter转为gl point值
                // (extent / this.options['tileSize'][1])用于将gl point转为瓦片内坐标
                vScale : zScale * (extent / this.options['tileSize'][1])
                //<<
            });
        const buffers = [faces.vertices.buffer, faces.featureIndexes.buffer];

        let oldIndices;
        if (shadowVolume) {
            oldIndices = faces.indices;
        }
        //in buildUniqueVertex, indices will be updated
        const l = faces.indices.length;
        const ctor = getIndexArrayType(l);
        faces.indices = new ctor(faces.indices);
        buffers.push(faces.indices.buffer);

        const uniqueFaces = buildUniqueVertex({ vertices : faces.vertices }, faces.indices, { 'vertices' : { size : 3 }});
        faces.vertices = uniqueFaces.vertices;
        // debugger
        if (normal || shadowVolume) {
            const normals = buildFaceNormals(faces.vertices, faces.indices);
            faces.normals = normals;
            buffers.push(normals.buffer);
        }
        if (tangent) {
            //TODO caculate tangent
        }
        if (uv) {
            buffers.push(faces.uvs.buffer);
        }
        if (shadowVolume) {
            const shadowVolume = buildShadowVolume(faces.vertices, oldIndices, faces.indices, faces.normals, faces.featureIndexes, shadowDir);
            faces.shadowVolume = shadowVolume;
            buffers.push(shadowVolume.vertices.buffer, shadowVolume.indices.buffer, shadowVolume.indexes.buffer);
        }
        return {
            data : faces,
            buffers
        };
    }

    _buildWireframe(features, dataConfig, extent) {
        const frames = buildWireframe(features, extent, dataConfig);
        const buffers = [frames.vertices.buffer, frames.indices.buffer, frames.featureIndexes.buffer];
        return {
            data : frames,
            buffers
        };
    }

    /**
     * Filter
     * @param {*} filter
     * @param {*} features
     */
    _filterFeatures(filter, features, type, styleIdx) {
        //if all the features are filtered by the plugin
        let feature, count = 0;
        const l = features.length;
        for (let i = 0; i < l; i++) {
            feature = features[i];
            // a feature can only be painted once by one plugin
            if ((feature.styleMark === undefined || feature.styleMark[type] === undefined) && (!filter || filter(feature))) {
                if (!feature.styleMark) {
                    feature.styleMark = {};
                }
                feature.styleMark[type] = styleIdx;
            }
            if (feature.styleMark && feature.styleMark[type]) {
                count++;
            }
        }
        return count === l;
    }

    _compileStyle(layerStyle) {
        this.pluginConfig = layerStyle.map(s => {
            const style = extend({}, s, {
                style : compileStyle(s.style)
            });
            for (let i = 0; i < style.style.length; i++) {
                style.style[i].filterKey = Array.isArray(s.style[i].filter) ? s.style[i].filter.join() : 'default';
            }
            return style;
        });
    }
}

// LayerWorker.prototype.getProjViewMatrix = function (transform) {
//     const m = new Float64Array(16);
//     const m1 = new Float32Array(16);
//     return function (tileInfo, matrix) {
//         const tilePos = tileInfo.point;
//         const tileSize = this.tileSize;

//         const tileMatrix = mat4.identity(m);
//         mat4.translate(tileMatrix, tileMatrix, [tilePos.x, tilePos.y, 0]);
//         mat4.scale(tileMatrix, tileMatrix, [tileSize[0] / EXTENT, tileSize[1] / EXTENT, 1]);

//         //local transform in current frame
//         if (transform) {
//             mat4.multiply(tileMatrix, tileMatrix, transform);
//         }

//         mat4.multiply(tileMatrix, matrix, tileMatrix);

//         return mat4.copy(m1, tileMatrix);
//     };
// }();

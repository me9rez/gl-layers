import Analysis from './Analysis';
import { reshader } from '@maptalks/gl';
import FloodPass from './pass/FloodPass';
import { altitudeToDistance } from './common/Util';

const DEFAULT_WATER_COLOR = [0.1451, 0.2588, 0.4863];
const VEC4 = [0, 0, 0, 0];
export default class FloodAnalysis extends Analysis {
    constructor(options) {
        super(options);
        this.type = 'floodAnalysis';
    }

    addTo(layer) {
        super.addTo(layer);
        const renderer = this.layer.getRenderer();
        this.regl = renderer.regl;
        if (renderer) {
            this._setViewshedPass(renderer);
        } else {
            this.layer.once('renderercreate', e => {
                this._setViewshedPass(e.renderer);
            }, this);
        }
        const map = this.layer.getMap();
        this._renderOptions = {};
        this._renderOptions['waterHeight'] = altitudeToDistance(map, this.options.waterHeight);
        this._renderOptions['extent'] = VEC4;
        this._renderOptions['extentMap'] = renderer.regl.texture({width: 2, height: 2});
        this._renderOptions['hasExtent'] = 0;
        if (this.options.boundary) {
            const { extentMap, extentInWorld } = this._calExtent(this.options.boundary);
            this._renderOptions['extent'] = extentInWorld;
            this._renderOptions['extentMap'] = extentMap;
            this._renderOptions['hasExtent'] = 1;
        }
        this._renderOptions['projViewMatrix'] = map.projViewMatrix;
        return this;
    }

    _setViewshedPass(renderer) {
        const viewport = this._viewport = {
            x : 0,
            y : 0,
            width : () => {
                return renderer.canvas ? renderer.canvas.width : 1;
            },
            height : () => {
                return renderer.canvas ? renderer.canvas.height : 1;
            }
        };
        const floodRenderer = new reshader.Renderer(renderer.regl);
        this._pass = this._pass || new FloodPass(floodRenderer, viewport);
        this.layer.addAnalysis(this);
    }

    update(name, value) {
        if (name === 'boundary') {
            const { extentMap, extentInWorld, extentPolygon } = this._calExtent(value);
            this._renderOptions['extent'] = extentInWorld;
            this._renderOptions['extentPolygon'] = extentPolygon;
            this._renderOptions['extentMap'] = extentMap;
        }else if (name === 'waterHeight') {
            const map = this.layer.getMap();
            this._renderOptions['waterHeight'] = map.altitudeToPoint(value || 0, map.getGLRes());
        } else {
            this._renderOptions[name] = value;
        }
        super.update(name, value);
    }

    renderAnalysis(meshes) {
        const uniforms = {};
        if (this.options.boundary) {
            this._extentPass.render(this._extentMeshes, this._pvMatrix);
        }
        uniforms['flood_waterColor'] = this.options['waterColor'] || DEFAULT_WATER_COLOR;
        uniforms['floodMap'] = this._pass.render(meshes, this._renderOptions);
        return uniforms;
    }

    getDefines() {
        return {
            HAS_FLOODANALYSE: 1
        };
    }
}

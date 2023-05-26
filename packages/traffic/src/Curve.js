import Segment from './Segment.js';

export default class Curve {
    constructor(atA, atB, atO, atQ) {
        this.A = atA;
        this.B = atB;
        this.O = atO;
        this.Q = atQ;
        this.AB = new Segment(this.A, this.B);
        this.AO = new Segment(this.A, this.O);
        this.OQ = new Segment(this.O, this.Q);
        this.QB = new Segment(this.Q, this.B);
        this.len = null;
    }

    get length() {
        let i, point, pointsNumber, prevoiusPoint, index;
        if (this.len == null) {
            pointsNumber = 10;
            prevoiusPoint = null;
            this.len = 0;
            for (i = index = 0; 0 <= pointsNumber ? index <= pointsNumber : index >= pointsNumber; i = 0 <= pointsNumber ? ++index : --index) {
                point = this.getPoint(i / pointsNumber);
                if (prevoiusPoint) {
                    this.len += point.subtract(prevoiusPoint).length;
                }
                prevoiusPoint = point;
            }
        }
        return this.len;
    }

    getPoint(atPoint) {
        const p0 = this.AO.getPoint(atPoint);
        const p1 = this.OQ.getPoint(atPoint);
        const p2 = this.QB.getPoint(atPoint);
        const r0 = new Segment(p0, p1).getPoint(atPoint);
        const r1 = new Segment(p1, p2).getPoint(atPoint);
        return new Segment(r0, r1).getPoint(atPoint);
    }

    getDirection(atPoint) {
        const p0 = this.AO.getPoint(atPoint);
        const p1 = this.OQ.getPoint(atPoint);
        const p2 = this.QB.getPoint(atPoint);
        const r0 = new Segment(p0, p1).getPoint(atPoint);
        const r1 = new Segment(p1, p2).getPoint(atPoint);
        return new Segment(r0, r1).direction;
    }
}

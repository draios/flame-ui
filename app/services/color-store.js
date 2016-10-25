/* global d3 */

import Ember from 'ember';

const colors = [
    '#66c2a5',
    '#fc8d62',
    '#8da0cb',
    '#e78ac3',
    // '#a6d854',
    '#ffd92f',
    '#e5c494',
    '#b3b3b3'
];

export default Ember.Service.extend({
    init() {
        this._super.apply(this, arguments);

        this.setProperties({
            colors:             d3.scale.ordinal().range(colors),
            lastColorIndex:     0,
            containerNames:     {},
            containerNameList:  [],
        });
    },

    assignColor(containerName) {
        var containerNames = this.get('containerNames');
        var color = containerNames[containerName];
        if (color === undefined) {
            color = this.get('colors')(this.get('lastColorIndex'));
            containerNames[containerName] = color;
            this.get('containerNameList').pushObject(containerName);
            this.incrementProperty('lastColorIndex');
        }

        return color;
    }
});
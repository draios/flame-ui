/* global require, module */
var EmberApp = require('ember-cli/lib/broccoli/ember-app');
var Funnel = require('broccoli-funnel');

module.exports = function(defaults) {
    var app = new EmberApp(defaults, {
        fingerprint: {
            //
            // Disable fingerprinting since we're going to inline content anyway
            //
            enabled: false
        },
        SRI: {
            //
            // Disable integrity check. For more information, refer to https://github.com/jonathanKingston/ember-cli-sri
            //
            enabled: false
        }
    });

    // D3
    app.import(app.bowerDirectory + '/d3/d3.v2.js');

    // Reset CSS
    app.import(app.bowerDirectory + '/reset-css/reset.css');

    // eq.js
    app.import(app.bowerDirectory + '/eq.js/build/eq.js');

    // Roboto webfont
    var robotoFontAsset = new Funnel('vendor/roboto', {
        srcDir: '/',
        include: ['*.woff', '*.woff2', '*.eot', '*.svg', '*.ttf'],
        destDir: '/assets/fonts'
    });
    app.import('vendor/roboto/stylesheet.css');

    // Material Design icons
    var materialIconsAsset = new Funnel(app.bowerDirectory + '/material-design-icons-iconfont/dist/fonts', {
        srcDir: '/',
        include: ['*.woff', '*.woff2', '*.eot', '*.ttf'],
        destDir: '/assets/fonts'
    });
    app.import(app.bowerDirectory + '/material-design-icons-iconfont/dist/material-design-icons.css');

    return app.toTree([robotoFontAsset, materialIconsAsset]);
};

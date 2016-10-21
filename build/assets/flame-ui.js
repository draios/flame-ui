"use strict";
/* jshint ignore:start */

/* jshint ignore:end */

define('flame-ui/app', ['exports', 'ember', 'ember/resolver', 'ember/load-initializers', 'flame-ui/config/environment'], function (exports, Ember, Resolver, loadInitializers, config) {

  'use strict';

  /* global d3 */

  var App;

  Ember['default'].MODEL_FACTORY_INJECTIONS = true;

  App = Ember['default'].Application.extend({
    modulePrefix: config['default'].modulePrefix,
    podModulePrefix: config['default'].podModulePrefix,
    Resolver: Resolver['default']
  });

  loadInitializers['default'](App, config['default'].modulePrefix);

  //
  // Patch d3.entries to include only own property and avoid extra properties added by Ember prototypes.
  //
  d3.entries = function (map) {
    var entries = [];
    for (var key in map) {
      if (map.hasOwnProperty(key)) {
        entries.push({ key: key, value: map[key] });
      }
    }
    return entries;
  };

  exports['default'] = App;

});
define('flame-ui/components/app-container', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    var get = Ember['default'].get;
    var set = Ember['default'].set;
    var setProperties = Ember['default'].setProperties;

    exports['default'] = Ember['default'].Component.extend({
        transactionStore: Ember['default'].inject.service(),

        classNames: ['sd-app-container'],

        init: function init() {
            this._super.apply(this, arguments);

            setProperties(this, {
                transaction: null,
                aggregation: null,
                transactionData: null,
                span: null,
                spanMode: null,
                spanLog: null
            });
        },

        didInitAttrs: function didInitAttrs() {
            this.selectTransaction(this.get('transactions')[0].node);
        },

        chartPanelSize: Ember['default'].computed('span', function () {
            return this.get('span') ? 'row-2' : 'row-3';
        }),

        selectTransaction: function selectTransaction(transaction, aggregation) {
            var me = this;
            var currentAggregation = aggregation || get(me, 'aggregation') || 'avg';

            if (get(me, 'transaction') !== transaction || get(me, 'aggregation') !== currentAggregation) {
                setProperties(me, {
                    transaction: transaction,
                    aggregation: currentAggregation,
                    span: null
                });

                me.get('transactionStore').findTransaction(transaction, currentAggregation).then(function (result) {
                    setProperties(me, {
                        transaction: transaction,
                        aggregation: currentAggregation,
                        transactionData: result
                    });
                });
            } else {
                setProperties(me, {
                    transaction: null,
                    transactionData: null,
                    span: null
                });
            }
        },

        actions: {
            selectTransaction: function selectTransaction(transaction, aggregation) {
                this.selectTransaction(transaction, aggregation);
            },

            changeAggregation: function changeAggregation(aggregation) {
                var me = this;
                var transaction = this.get('transaction');

                me.get('transactionStore').findTransaction(transaction, aggregation).then(function (result) {
                    setProperties(me, {
                        transaction: transaction,
                        aggregation: aggregation,
                        transactionData: result
                    });
                });
            },

            selectSpan: function selectSpan(span) {
                var me = this;
                var currentMode = get(this, 'spanMode') || 'SPAN';

                if (get(me, 'span') !== span) {
                    setProperties(me, {
                        span: span,
                        spanMode: currentMode
                    });

                    get(me, 'transactionStore').findSpanLog(span, currentMode).then(function (result) {
                        setProperties(me, {
                            span: span,
                            spanMode: currentMode,
                            spanLog: result
                        });
                    });
                } else {
                    setProperties(me, {
                        span: null,
                        spanMode: null,
                        spanLog: null
                    });
                }
            },

            selectSpanMode: function selectSpanMode(mode) {
                var me = this;
                var currentSpan = get(this, 'span');

                set(this, 'spanMode', mode);

                get(me, 'transactionStore').findSpanLog(currentSpan, mode).then(function (result) {
                    setProperties(me, {
                        span: currentSpan,
                        spanMode: mode,
                        spanLog: result
                    });
                });
            }
        }
    });

});
define('flame-ui/components/app-version', ['exports', 'ember-cli-app-version/components/app-version', 'flame-ui/config/environment'], function (exports, AppVersionComponent, config) {

  'use strict';

  var _config$APP = config['default'].APP;
  var name = _config$APP.name;
  var version = _config$APP.version;

  exports['default'] = AppVersionComponent['default'].extend({
    version: version,
    name: name
  });

});
define('flame-ui/components/flame-ui', ['exports', 'ember', 'flame-ui/components/sd-panel', 'flame-ui/helpers/fmt-time-interval', 'flame-ui/lib/flame-graph'], function (exports, Ember, SDPanel, fmtTimeInterval, FlameGraph) {

    'use strict';

    /* global d3 */

    var get = Ember['default'].get;
    var set = Ember['default'].set;
    var setProperties = Ember['default'].setProperties;

    exports['default'] = SDPanel['default'].extend({
        colorStore: Ember['default'].inject.service('color-store'),

        classNames: ['flame-ui'],

        aggregationOptions: Ember['default'].A([{
            value: 'avg',
            name: 'Average'
        }, {
            value: 'min',
            name: 'Minimum'
        }, {
            value: 'max',
            name: 'Maximum'
        }]),

        init: function init() {
            this._super();

            var me = this;
            setProperties(me, {
                activeSpan: null,
                chart: null,
                detailMode: 'popout',
                chartContext: {
                    detailClose: function detailClose() {
                        var svPopoutBox = d3.select('#' + me.$().attr('id') + ' #svPopout');
                        if (get(me, 'detailMode') !== 'zoom') {
                            svPopoutBox.html('');
                            svPopoutBox.style('opacity', null);
                            svPopoutBox.style('z-index', null);
                        } else {
                            get(me, 'chart').zoomSet({ 'x': 0, 'dx': 1, 'y': 0 });
                        }
                    },
                    detailOpen: function svDetailOpen(d) {
                        function svMakeSubgraphData(d) {
                            /*
                             * First, construct everything from the current node to all of its
                             * leafs.
                             */
                            var tree, oldtree;

                            tree = {};
                            tree[d.data.key] = d.data.value;

                            while (d.parent !== undefined) {
                                oldtree = tree;
                                tree = {};
                                tree[d.parent.data.key] = {
                                    't': d.parent.data.value.t,
                                    'svTotal': d.parent.data.value.svTotal,
                                    'ch': oldtree
                                };
                                d = d.parent;
                            }

                            return tree;
                        }

                        var svPopoutBox = d3.select('#' + me.$().attr('id') + ' #svPopout');
                        if (get(me, 'detailMode') !== 'zoom') {
                            svPopoutBox.html('');
                            new FlameGraph['default'](svPopoutBox, svMakeSubgraphData(d), null, null, get(me, 'chartContext'), {
                                getNodeColor: me.getNodeColor.bind(me)
                            });
                            svPopoutBox.style('z-index', 1);
                            svPopoutBox.style('opacity', 1);
                        } else {
                            get(me, 'chart').zoomSet(d);
                        }
                    },
                    mouseout: function mouseout() {
                        Ember['default'].run(function () {
                            set(me, 'activeSpan', null);
                        });
                    },
                    mouseover: function mouseover(d, det) {
                        Ember['default'].run(function () {
                            set(me, 'activeSpan', {
                                name: det.label,
                                container: d.data.value.cont,
                                commandLine: d.data.value.exe,
                                timeTotal: fmtTimeInterval['default'](d.data.value.tt, 3, 1).output,
                                timeInNode: fmtTimeInterval['default'](d.data.value.t, 3, 1).output,
                                childCount: d.data.value.nconc
                            });
                        });
                    },
                    select: function select(d) {
                        Ember['default'].run(function () {
                            me.sendAction('select', d);
                        });
                    }
                }
            });
        },

        didInsertElement: function didInsertElement() {
            if (this.attrs.data.value) {
                this.renderChart(this.attrs.data.value, this.attrs.node.value);
            }
        },

        didUpdateAttrs: function didUpdateAttrs(args) {
            set(this, 'activeSpan', null);

            if (args.newAttrs.data.value !== args.oldAttrs.data.value) {
                this.destroyChart();
                if (args.newAttrs.data.value) {
                    this.renderChart(args.newAttrs.data.value, args.newAttrs.node.value);
                }
            }
        },

        renderChart: function renderChart(data) {
            set(this, 'chart', new FlameGraph['default'](d3.select('#' + this.$().attr('id') + ' #chart'), data, null, null, get(this, 'chartContext'), {
                axisLabels: true,
                getNodeColor: this.getNodeColor.bind(this)
            }));
        },

        destroyChart: function destroyChart() {
            d3.select('#' + this.$().attr('id') + ' #chart').html("");
        },

        getNodeColor: function getNodeColor(containerName) {
            return get(this, 'colorStore').assignColor(containerName);
        },

        containerNameList: Ember['default'].computed('data', function () {
            function recursion(ch) {
                var keys = Object.keys(ch);
                var i, iz;
                for (i = 0, iz = keys.length; i < iz; i++) {
                    if (ch[keys[i]].cont && map[ch[keys[i]].cont] === undefined) {
                        map[ch[keys[i]].cont] = true;
                        list.push(ch[keys[i]].cont);
                    }

                    if (ch[keys[i]].cont && ch[keys[i]].ch) {
                        recursion(ch[keys[i]].ch);
                    }
                }
            }

            var list = [];
            var map = {};

            if (this.attrs.data.value) {
                recursion(this.attrs.data.value[''].ch);
            }

            return list;
        }),

        legendItems: Ember['default'].computed('containerNameList', function () {
            return get(this, 'containerNameList').map(function (containerName) {
                return {
                    name: containerName,
                    color: new Ember['default'].Handlebars.SafeString('color: ' + get(this, 'colorStore').assignColor(containerName))
                };
            }, this);
        }),

        actions: {
            changeAggregation: function changeAggregation(value) {
                this.sendAction('changeAggregation', value);
            }
        }
    });

});
define('flame-ui/components/input-toggle', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        tagName: 'label',
        classNames: ['input-toggle'],
        input: Ember['default'].$(),

        didInsertElement: function didInsertElement() {
            this.set('input', this.$('input'));
        },

        actions: {
            toggle: function toggle() {
                var $input = this.get('input');

                if ($input.is(':disabled')) {
                    return;
                }
                this.toggleProperty('checked');
                $input.trigger('change');
                //
                // Need this run next or the action is triggered too early
                //
                Ember['default'].run.next(this, function () {
                    this.sendAction('onChange', this.get('checked'));
                });
            }
        }
    });

});
define('flame-ui/components/sd-dropdown-item', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        tagName: 'li',
        classNameBindings: ['item.hidden:-hidden'],

        selectedOption: null,
        isSelected: Ember['default'].computed('selectedOption', function () {
            return this.get('selectedOption') === this.get('item.value');
        }),

        actions: {
            selectOption: function selectOption(value) {
                this.sendAction('selectOption', value);
            },
            setDropdownStatus: function setDropdownStatus(status) {
                this.sendAction('setDropdownStatus', status);
            }
        }
    });

});
define('flame-ui/components/sd-dropdown-trigger', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        tagName: 'button',

        click: function click() {
            this.send('toggleDropdown');
        },

        actions: {
            toggleDropdown: function toggleDropdown() {
                this.sendAction('toggleDropdown');
            }
        }
    });

});
define('flame-ui/components/sd-dropdown', ['exports', 'ember', 'flame-ui/mixins/clickElseWhere'], function (exports, Ember, ClickElseWhereMixin) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend(ClickElseWhereMixin['default'], {
        classNames: ['sd-dropdown-wrapper'],
        classNameBindings: ['isDropdownOpen:-open'],

        items: Ember['default'].A(),
        isDropdownOpen: false,
        selectedOption: null,

        label: 'Dropdown',

        action: 'select',

        onClickElsewhere: function onClickElsewhere(evt) {
            var el = Ember['default'].$(evt.target);

            // Exit if the target element is not in the DOM anymore
            // it means that the clicked element was the "Edit" button of the smartTextbox
            if (Ember['default'].$(document).find(el).length === 0) return;

            // Check if the clicked element is inside the current smartTextbox, if not, close the edit mode
            if (this.$() && this.$().has(el).length === 0) {
                this.send('setDropdownStatus', false);
            }
        },

        actions: {
            // inverts the current status
            toggleDropdown: function toggleDropdown() {
                this.toggleProperty('isDropdownOpen');
            },
            // false = close, true = open
            setDropdownStatus: function setDropdownStatus(status) {
                this.set('isDropdownOpen', status);
            },
            // triggered when an option is selected
            selectOption: function selectOption(value) {
                // send a custom action to the parent, passing the value of the selected option as parameter
                this.sendAction(this.get('action'), value);
                // highlight current option
                this.set('selectedOption', value);
                // close the dropdown
                this.send('setDropdownStatus', false);
            }
        }
    });

});
define('flame-ui/components/sd-header', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        tagName: 'header',
        classNames: ['sd-header']
    });

});
define('flame-ui/components/sd-panel-content', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        classNames: ['sd-panel-content']
    });

});
define('flame-ui/components/sd-panel-footer', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        classNames: ['sd-panel-footer']
    });

});
define('flame-ui/components/sd-panel-header', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        classNames: ['sd-panel-header']
    });

});
define('flame-ui/components/sd-panel-sidebar', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        classNames: ['sd-panel-sidebar'],
        classNameBindings: ['collapsed:-collapsed']
    });

});
define('flame-ui/components/sd-panel', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    // sd-panel, `sd` stands for Sysdig, it's the basic panel component used in our app

    exports['default'] = Ember['default'].Component.extend({
        classNames: ['sd-panel']
    });

});
define('flame-ui/components/sd-tab-item', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        tagName: 'li',
        classNames: ['sd-tab-item'],
        classNameBindings: ['isActive:-active'],

        // Here we store the value of the tab (it works like an HTML select widget)
        value: null,

        // Register this tab as part of the parent tabs-list, doing so we'll know how many tabs have our list
        // and we can set the first tab as the default activated
        setup: Ember['default'].on('didInsertElement', function () {
            this.send('registerTab');
        }),

        // Use this property to know if the current tab is the active one
        isActive: Ember['default'].computed('activeTab', function () {
            return this.get('activeTab') === this.get('value');
        }),

        // Clicking on this tab will activate it
        click: function click() {
            this.send('activateTab');
        },

        actions: {
            registerTab: function registerTab() {
                this.sendAction('registerTab', this.get('value'));
            },
            activateTab: function activateTab() {
                this.sendAction('activateTab', this.get('value'));
            }
        }
    });

});
define('flame-ui/components/sd-table', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        classNames: ['sd-table', 'table-container'],
        attributeBindings: ['eqPts:data-eq-pts'],

        // Set sticky to true when your table needs a sticky_on_top header
        // remember to wrap your `th` content inside a `div.th-inner` and make sure the table is direct child of a flexbox
        sticky: false,
        hasStickHeader: Ember['default'].computed.oneWay('sticky'),

        // We apply this dummy property just to enable eq.js on this component and take advantage of the `eqResize` event
        eqPts: 'x:0',

        setupThead: Ember['default'].on('didInsertElement', function () {
            this.updateThead(this.$('.thead'));
            this.$().on('eqResize', (function () {
                this.updateThead(this.$('.thead'));
            }).bind(this));
        }),
        updateThead: function updateThead($thead) {
            $thead.find('th').each((function (index, th) {
                var $th = this.$(th);
                var thInner = $th.find('.th-inner')[0];
                var width = $th.width();
                var paddingLeft = thInner ? window.getComputedStyle(thInner).getPropertyValue('padding-left').slice(0, -2) : 0;
                var paddingRight = thInner ? window.getComputedStyle(thInner).getPropertyValue('padding-right').slice(0, -2) : 0;
                $th.find('.th-inner').width(width - paddingLeft - paddingRight); // TODO: get rid of the `- 20`
            }).bind(this));
        }
    });

});
define('flame-ui/components/sd-tabs-list', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Component.extend({
        tagName: 'ul',
        classNames: ['sd-tabs-list'],

        // This is the list of tabs' IDs contained in this tabs-list
        // everytime a new tabs-list is initialized, we set it as empty array
        tabs: null,
        init: function init() {
            this._super();
            this.set('tabs', Ember['default'].A([]));
        },

        // By default, set as active tab the first one
        // this prop will then be overrided when a different one is activated
        activeTab: Ember['default'].computed('tabs.[]', function () {
            return this.get('tabs.0');
        }),

        actions: {
            registerTab: function registerTab(tab) {
                this.get('tabs').pushObject(tab);
            },
            activateTab: function activateTab(tab) {
                this.set('activeTab', tab);
            }
        }
    });

});
define('flame-ui/components/span-log', ['exports', 'ember', 'flame-ui/components/sd-panel'], function (exports, Ember, SDPanel) {

    'use strict';

    exports['default'] = SDPanel['default'].extend({
        classNames: ['span-log'],

        lines: Ember['default'].computed('log', function () {
            var log = this.get('log');
            if (!log) return;
            return this.get('log').map(function (line) {
                return Ember['default'].$.extend(line, {
                    color: new Ember['default'].Handlebars.SafeString('color: ' + line.col),
                    lineColor: new Ember['default'].Handlebars.SafeString('color: ' + line.contCol)
                });
            });
        }),

        actions: {
            selectMode: function selectMode(mode) {
                this.sendAction('selectMode', mode);
            }
        }
    });

});
define('flame-ui/components/transactions-table', ['exports', 'flame-ui/components/sd-panel'], function (exports, SPanel) {

    'use strict';

    exports['default'] = SPanel['default'].extend({
        classNames: ['transactions-table'],

        actions: {
            select: function select(node, view) {
                this.sendAction('select', node, view);
            }
        }
    });

});
define('flame-ui/controllers/array', ['exports', 'ember'], function (exports, Ember) {

	'use strict';

	exports['default'] = Ember['default'].Controller;

});
define('flame-ui/controllers/object', ['exports', 'ember'], function (exports, Ember) {

	'use strict';

	exports['default'] = Ember['default'].Controller;

});
define('flame-ui/helpers/fmt-time-interval', ['exports'], function (exports) {

    'use strict';

    //
    // convert a nanosecond time interval into a s.ns representation.
    // 1100000000 becomes 1.1s
    //
    exports['default'] = function (value, decimals, step) {
        decimals = decimals === undefined ? 2 : decimals;
        step = step === undefined ? 2 : step;

        var units = ['ns', 'us', 'ms', 's', 'min', 'h', 'd'];
        var absValue = Math.abs(value);
        var multipliers = [1000, 1000, 1000, 60, 60, 24];
        var multiplier = 1;
        var i;
        for (i = 0; i < units.length; i++) {
            if (absValue < multiplier * step * multipliers[i]) {
                break;
            } else if (i < units.length - 1) {
                multiplier = multiplier * multipliers[i];
            }
        }
        i = i < units.length ? i : units.length - 1;

        var convertedValue = (value / multiplier).toFixed(decimals);
        var unit = units[i];

        return {
            value: convertedValue,
            unit: unit,
            output: convertedValue + ' ' + unit
        };
    }

});
define('flame-ui/helpers/fmtTimeInterval', ['exports'], function (exports) {

    'use strict';

    //
    // convert a nanosecond time interval into a s.ns representation.
    // 1100000000 becomes 1.1s
    //
    exports['default'] = function (value, decimals, step) {
        decimals = decimals === undefined ? 2 : decimals;
        step = step === undefined ? 2 : step;

        var units = ['ns', 'us', 'ms', 's', 'min', 'h', 'd'];
        var absValue = Math.abs(value);
        var multipliers = [1000, 1000, 1000, 60, 60, 24];
        var multiplier = 1;
        var i;
        for (i = 0; i < units.length; i++) {
            if (absValue < multiplier * step * multipliers[i]) {
                break;
            } else if (i < units.length - 1) {
                multiplier = multiplier * multipliers[i];
            }
        }
        i = i < units.length ? i : units.length - 1;

        var convertedValue = (value / multiplier).toFixed(decimals);
        var unit = units[i];

        return {
            value: convertedValue,
            unit: unit,
            output: convertedValue + ' ' + unit
        };
    }

});
define('flame-ui/helpers/is-equal', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Helper.extend({
    compute: function compute(params, hash) {
      return hash.a === hash.b;
    }
  });

});
define('flame-ui/initializers/app-version', ['exports', 'ember-cli-app-version/initializer-factory', 'flame-ui/config/environment'], function (exports, initializerFactory, config) {

  'use strict';

  var _config$APP = config['default'].APP;
  var name = _config$APP.name;
  var version = _config$APP.version;

  exports['default'] = {
    name: 'App Version',
    initialize: initializerFactory['default'](name, version)
  };

});
define('flame-ui/initializers/export-application-global', ['exports', 'ember', 'flame-ui/config/environment'], function (exports, Ember, config) {

  'use strict';

  exports.initialize = initialize;

  function initialize() {
    var application = arguments[1] || arguments[0];
    if (config['default'].exportApplicationGlobal !== false) {
      var theGlobal;
      if (typeof window !== 'undefined') {
        theGlobal = window;
      } else if (typeof global !== 'undefined') {
        theGlobal = global;
      } else if (typeof self !== 'undefined') {
        theGlobal = self;
      } else {
        // no reasonable global, just bail
        return;
      }

      var value = config['default'].exportApplicationGlobal;
      var globalName;

      if (typeof value === 'string') {
        globalName = value;
      } else {
        globalName = Ember['default'].String.classify(config['default'].modulePrefix);
      }

      if (!theGlobal[globalName]) {
        theGlobal[globalName] = application;

        application.reopen({
          willDestroy: function willDestroy() {
            this._super.apply(this, arguments);
            delete theGlobal[globalName];
          }
        });
      }
    }
  }

  exports['default'] = {
    name: 'export-application-global',

    initialize: initialize
  };

});
define('flame-ui/lib/flame-graph', ['exports'], function (exports) {

    'use strict';

    /* global d3 */

    /*
     * Input: "d", a D3 node from the layout, typically resembling:
     *     parent: ...,  // parent D3 node
     *     data: {
     *         key: ..., // function name
     *         value: {
     *             svTotal: ...,
     *             t: ...,
     *             ch: ...
     *         }
     *     }
     * Output: an object describing the raw flame graph data, matching the form:
     *     "": {
     *         svTotal: ...
     *         t: ...
     *         ch: {
     *             key1: { // function name
     *                 svTotal: ...
     *                 t: ...
     *                 ch: ...
     *             },
     *             ...
     *         }
     *     }
     */

    /* Configuration */
    // var svSvgWidth = null;      /* image width (null to auto-compute) */
    // var svSvgHeight = null;     /* image height (null to auto-compute) */
    var svAxisLabelWidth = 45; /* width of axis labels */
    // var svChartWidth = null;    /* width of chart part of image */
    // var svChartHeight = null;   /* height of chart part of image */
    var svGrowDown = false; /* if true, stacks are drawn growing down */
    var svTransitionTime = 2000; /* time for transition */
    var svCornerPixels = 2; /* radius of rounded corners */
    var svTextPaddingLeft = 5; /* padding-left on rectangle labels */
    var svTextPaddingRight = 10; /* pading-right on rectangle labels */
    var svTextPaddingTop = '1.0em'; /* padding-top on rectangle labels */
    var svColorMode = 'mono'; /* coloring mode */
    // var svDetailMode = 'popout';    /* detail display mode ("zoom" or "popout") */

    /*
     * Build a flame graph rooted at the given "node" (a D3 selection) with the
     * given "rawdata" tree.  The graph will have size defined by "pwidth" and
     * "pheight".  "context" is used for notifications about UI actions.
     */
    function FlameGraph(node, rawdata, pwidth, pheight, context, options) {
        function svCreateBarLabel(d) {
            var nconc = d.data.value.nconc;

            if (nconc) {
                return d.data.key + ' (' + nconc + ')';
            } else {
                return d.data.key;
            }
        }

        var axiswidth, chartheight, rect, scale, nodeid, axis, data;
        var fg = this;

        this.fg_context = context;
        this.fg_maxdepth = 0;
        this.fg_maxunique = 0;
        this.fg_depthsamples = [];
        this.computeDepth(rawdata, 0);

        options.coloring = options.coloring || svColorMode;
        if (options.hasOwnProperty('growDown') === false) {
            options.growDown = svGrowDown;
        }

        if (options.axisLabels) {
            axiswidth = this.fg_axiswidth = svAxisLabelWidth;
        } else {
            axiswidth = this.fg_axiswidth = 0;
        }

        this.fg_svgwidth = pwidth !== null ? pwidth : parseInt(node.style('width'), 10);
        this.fg_svgheight = pheight !== null ? pheight : 25 * this.fg_maxdepth;
        this.fg_chartwidth = this.fg_svgwidth - axiswidth;
        chartheight = this.fg_chartheight = this.fg_svgheight - axiswidth;

        this.fg_xscale = d3.scale.linear().range([0, this.fg_chartwidth]);
        this.fg_yscale = d3.scale.linear().range([0, this.fg_chartheight]);

        this.fg_svg = node.append('svg:svg');
        this.fg_svg.attr('width', this.fg_svgwidth);
        this.fg_svg.attr('height', this.fg_svgheight);

        /* Create a background rectangle that resets the view when clicked. */
        rect = this.fg_svg.append('svg:rect');
        rect.attr('class', 'svBackground');
        rect.attr('width', this.fg_svgwidth);
        rect.attr('height', this.fg_svgheight);
        rect.attr('fill', '#ffffff');
        rect.on('click', this.detailClose.bind(this));
        rect.on('dblclick', this.detailClose.bind(this));

        /* Configure the partition layout. */
        this.fg_part = d3.layout.partition();
        this.fg_part.children(function (d) {
            return d3.entries(d.value.ch);
        });
        this.fg_part.value(function (d) {
            return d.value.svTotal;
        });
        this.fg_part.sort(function (d1, d2) {
            return d1.data.key.localeCompare(d2.data.key);
        });

        /* Configure the color function. */
        if (options.coloring === 'random') {
            scale = d3.scale.category20c();
            this.fg_color = function (d) {
                return scale(d.data.key);
            };
        } else {
            this.fg_color = function (d) {
                if (d.data.value.svSynthetic) {
                    return '#ffffff';
                }

                return options.getNodeColor(d.data.value.cont);
            };
        }

        /* Configure the actual D3 components. */
        nodeid = this.fg_nodeid = function (d) {
            return encodeURIComponent([d.data.key, fg.fg_yscale(d.y), fg.fg_xscale(d.x)].join('@'));
        };
        this.fg_rectwidth = function (d) {
            return fg.fg_xscale(d.dx);
        };
        this.fg_height = function (d) {
            return fg.fg_yscale(d.dy);
        };
        this.fg_textwidth = function (d) {
            return Math.max(0, fg.fg_rectwidth(d) - svTextPaddingRight);
        };
        this.fg_x = function (d) {
            return fg.fg_xscale(d.x) + fg.fg_axiswidth;
        };

        if (options.growDown) {
            this.fg_y = function (d) {
                return fg.fg_yscale(d.y);
            };
        } else {
            this.fg_y = function (d) {
                return chartheight - fg.fg_yscale(d.y);
            };
        }

        data = this.fg_part(d3.entries(rawdata)[0]);
        this.fg_rects = this.fg_svg.selectAll('rect').data(data).enter().append('svg:rect').attr('class', function (d) {
            return d.data.value.svSynthetic ? 'svBoxSynthetic' : 'svBox';
        }).attr('x', this.fg_x).attr('y', this.fg_y).attr('rx', svCornerPixels).attr('ry', svCornerPixels).attr('height', this.fg_height).attr('width', this.fg_rectwidth).attr('fill', this.fg_color).on('click', context.select.bind(this)).on('dblclick', this.detailOpen.bind(this)).on('mouseover', this.mouseover.bind(this)).on('mouseout', this.mouseout.bind(this));
        this.fg_clips = this.fg_svg.selectAll('clipPath').data(data).enter().append('svg:clipPath').attr('id', nodeid).append('svg:rect').attr('x', this.fg_x).attr('y', this.fg_y).attr('width', this.fg_textwidth).attr('height', this.fg_height);
        this.fg_text = this.fg_svg.selectAll('text').data(data).enter().append('text').attr('class', 'svBoxLabel').attr('x', this.fg_x).attr('y', this.fg_y).attr('dx', svTextPaddingLeft).attr('dy', svTextPaddingTop). // 12
        attr('clip-path', function (d) {
            return 'url("#' + nodeid(d) + '")';
        }).on('click', context.select.bind(this)).on('dblclick', this.detailOpen.bind(this)).on('mouseover', this.mouseover.bind(this)).on('mouseout', this.mouseout.bind(this)).text(function (d) {
            return svCreateBarLabel(d);
        });

        if (options.axisLabels) {
            axis = this.fg_svg.append('text');
            axis.attr('class', 'svYAxisLabel');
            axis.attr('x', -this.fg_svgheight);
            axis.attr('dx', '8em');
            axis.attr('y', '30px');
            axis.attr('transform', 'rotate(-90)');
            axis.text('Tiers');

            axis = this.fg_svg.append('text');
            axis.attr('class', 'svYAxisLabel');
            axis.attr('x', '30px');
            axis.attr('dx', '8em');
            /*
             * Magic constants here:
             *   30 is the height of the label (since we're specifying the
             *   top coordinate), and 25 is the height of each block
             *   (because there's an invisible row we want to cover up).
             */
            axis.attr('y', this.fg_svgheight - 30 - 25);
            axis.attr('width', this.fg_svgwidth - 30);
            //      axis.text('Percentage of Samples');
        }
    }

    FlameGraph.prototype.computeDepth = function (tree, depth) {
        var key, rem;

        if (depth > this.fg_maxdepth) {
            this.fg_maxdepth = depth;
        }

        if (depth >= this.fg_depthsamples.length) {
            this.fg_depthsamples[depth] = 0;
        }

        for (key in tree) {
            if (tree[key].t > this.fg_maxunique) {
                this.fg_maxunique = tree[key].t;
            }
            this.fg_depthsamples[depth] += tree[key].svTotal;
            this.computeDepth(tree[key].ch, depth + 1);

            rem = tree[key].t;
            if (rem > 0 && tree[key].ch[''] === undefined) {
                tree[key].ch[''] = {
                    'svSynthetic': true,
                    't': rem,
                    'svTotal': rem,
                    'ch': {}
                };
            }
        }
    };

    FlameGraph.prototype.detailClose = function () {
        if (this.fg_context !== null) {
            this.fg_context.detailClose();
        }
    };

    FlameGraph.prototype.detailOpen = function (d) {
        if (!d.data.value.svSynthetic && this.fg_context !== null) {
            this.fg_context.detailOpen(d);
        }
    };

    FlameGraph.prototype.mouseover = function (d) {
        if (d.data.value.svSynthetic || this.fg_context === null) {
            return;
        }

        var nsamples, nunique;
        var pctSamples, pctUnique;
        var detail;
        var fg = this;

        nsamples = d.data.value.svTotal;
        pctSamples = (100 * nsamples / this.fg_depthsamples[0]).toFixed(1);

        nunique = d.data.value.t;
        pctUnique = (100 * nunique / this.fg_depthsamples[0]).toFixed(1);

        detail = {
            'label': d.data.key,
            'nsamples': d.data.value.svTotal,
            'nunique': d.data.value.t,
            'nallsamples': this.fg_depthsamples[0],
            'pctSamples': pctSamples,
            'pctUnique': pctUnique,
            'x': d3.event.pageX,
            'y': d3.event.pageY
        };

        this.fg_hoverto = setTimeout(function () {
            fg.fg_hoverto = null;
            fg.fg_context.mouseover(d, detail);
        }, 50);
    };

    FlameGraph.prototype.mouseout = function (d) {
        if (this.fg_hoverto) {
            clearTimeout(this.fg_hoverto);
        }
        if (this.fg_context !== null) {
            this.fg_context.mouseout(d);
        }
    };

    FlameGraph.prototype.zoomSet = function (cd) {
        var fg = this;

        this.fg_xscale.domain([cd.x, cd.x + cd.dx]);
        this.fg_rectwidth = function (d) {
            return fg.fg_xscale(d.x + d.dx) - fg.fg_xscale(d.x);
        };
        this.fg_textwidth = function (d) {
            return Math.max(0, fg.fg_xscale(d.x + d.dx) - fg.fg_xscale(d.x) - svTextPaddingRight);
        };
        this.fg_rects.transition().duration(svTransitionTime).attr('x', this.fg_x).attr('width', this.fg_rectwidth);
        this.fg_clips.transition().duration(svTransitionTime).attr('x', this.fg_x).attr('width', this.fg_textwidth);
        this.fg_text.transition().duration(svTransitionTime).attr('x', this.fg_x);
    };

    exports['default'] = FlameGraph;

});
define('flame-ui/mixins/clickElseWhere', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Mixin.create({
        // By default, automatically initialize the event
        autoInitClickElsewhere: true,

        // Your custom function
        onClickElsewhere: Ember['default'].K,

        onClickElsewhereBound: null,

        // Set an event that will be fired when user clicks outside of the component/view
        setupClickElsewhereListener: function setupClickElsewhereListener() {
            this.set('onClickElsewhereBound', this.get('onClickElsewhere').bind(this));
            Ember['default'].$(document).on('mouseup', this.get('onClickElsewhereBound'));
            //Ember.$(document).on('mouseup', function() { console.log('a'); });
        },

        // Clean the previously defined event to keep events stack clean
        removeClickElsewhereListener: function removeClickElsewhereListener() {
            Ember['default'].$(document).off('moseup', this.get('onClickElsewhereBound'));

            // We can set the prop to null only if the object still exists
            if (this.isDetroyed || this.isDestroying) return;
            this.set('onClickElsewhereBound', null);
        },

        // Setup listener on didInsertElement
        setupClickElsewhereListenerOnLoad: Ember['default'].on('didInsertElement', function () {
            this.notifyPropertyChange('isClickElsewhereEnabled');
            if (this.get('autoInitClickElsewhere') === false) return;
            this.setupClickElsewhereListener();
        }),

        // Remove listener on willDestroyElement
        removeClickElsewhereListenerOnDestroy: Ember['default'].on('willDestroyElement', function () {
            if (this.get('autoInitClickElsewhere') === false) return;
            this.removeClickElsewhereListener();
        })
    });

});
define('flame-ui/router', ['exports', 'ember', 'flame-ui/config/environment'], function (exports, Ember, config) {

    'use strict';

    var Router = Ember['default'].Router.extend({
        location: config['default'].locationType
    });

    Router.map(function () {});

    exports['default'] = Router;

});
define('flame-ui/routes/application', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    exports['default'] = Ember['default'].Route.extend({
        transactionStore: Ember['default'].inject.service(),

        model: function model() {
            return this.get('transactionStore').findAll();
        }
    });

});
define('flame-ui/services/color-store', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    /* global d3 */

    exports['default'] = Ember['default'].Service.extend({
        init: function init() {
            this._super.apply(this, arguments);

            this.setProperties({
                colors: d3.scale.category10(),
                lastColorIndex: 0,
                containerNames: {},
                containerNameList: []
            });
        },

        assignColor: function assignColor(containerName) {
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

});
define('flame-ui/services/transaction-store', ['exports', 'ember', 'flame-ui/helpers/fmtTimeInterval'], function (exports, Ember, fmtTimeInterval) {

    'use strict';

    exports['default'] = Ember['default'].Service.extend({
        colorStore: Ember['default'].inject.service('color-store'),

        findAll: function findAll() {
            return new Ember['default'].RSVP.Promise(function (resolve) {
                Ember['default'].run.next(function () {
                    var data = {
                        avg: svFillData(window.transitions.avg),
                        min: svFillData(window.transitions.min),
                        max: svFillData(window.transitions.max)
                    };
                    var nodeIds = Object.keys(data.avg[''].ch);

                    var transactions = nodeIds.map(function (node) {
                        return {
                            node: node,
                            n: data.avg[""].ch[node].n,
                            avg: fmtTimeInterval['default'](data.avg[""].ch[node].tt, 3, 1).output,
                            min: fmtTimeInterval['default'](data.min[""].ch[node].tt, 3, 1).output,
                            max: fmtTimeInterval['default'](data.max[""].ch[node].tt, 3, 1).output
                        };
                    });

                    resolve(transactions);
                });
            });
        },

        findTransaction: function findTransaction(transaction, aggregation) {
            return new Ember['default'].RSVP.Promise(function (resolve) {
                Ember['default'].run.next(function () {
                    var data;
                    switch (aggregation) {
                        case 'avg':
                            data = svFillData(window.transitions.avg);
                            break;
                        case 'min':
                            data = svFillData(window.transitions.min);
                            break;
                        case 'max':
                            data = svFillData(window.transitions.max);
                            break;
                    }

                    resolve(createSubTree(data, transaction));
                });
            });
        },

        findSpanLog: function findSpanLog(span, spanMode) {
            var colorStore = this.get('colorStore');

            return new Ember['default'].RSVP.Promise(function (resolve) {
                Ember['default'].run.next(function () {
                    function svAddChildLogs(loglist, dk, dv, retnow) {
                        if (dv.logs !== undefined) {
                            for (var j = 0; j < dv.logs.length; j++) {
                                dv.logs[j].k = dk;
                                dv.logs[j].d = dv;
                            }

                            Array.prototype.push.apply(loglist, dv.logs);
                        }

                        if (retnow === true) {
                            return;
                        }

                        var childs = dv.ch;
                        for (var ch in childs) {
                            svAddChildLogs(loglist, ch, childs[ch]);
                        }
                    }

                    var loglist = [];

                    if (spanMode === 'SPAN') {
                        svAddChildLogs(loglist, span.data.key, span.data.value, true);
                    } else {
                        svAddChildLogs(loglist, span.data.key, span.data.value);
                        loglist.sort(function (a, b) {
                            if (a.th === b.th) {
                                return a.tl - b.tl;
                            } else {
                                return a.th - b.th;
                            }
                        });
                    }

                    var lines = [];
                    for (var j = 0; j < loglist.length; j++) {
                        var logLine = loglist[j].b.toLowerCase();
                        var col;

                        //
                        // Determine the log text color
                        //
                        if (logLine.indexOf("err") > -1) {
                            col = '#ff0000';
                        } else if (logLine.indexOf("warn") > -1) {
                            col = '#ff8800';
                        } else {
                            col = '#000000';
                        }

                        //
                        // Determine the container color
                        //
                        var containerName = loglist[j].d.cont;

                        var contCol = colorStore.assignColor(containerName);

                        lines[j] = {
                            contCol: contCol,
                            containerName: containerName,
                            col: col,
                            k: loglist[j].k,
                            t: loglist[j].t,
                            b: loglist[j].b
                        };
                    }

                    resolve(lines);
                });
            });
        }
    });

    function createSubTree(fullTree, trName) {
        var res = {};
        res[""] = {};
        res[""].ch = {};
        res[""].ch[trName] = fullTree[""].ch[trName];

        return res;
    }

    function svFillData(tree) {
        var key, rem;

        for (key in tree) {
            svFillData(tree[key].ch);

            rem = tree[key].t;
            if (rem > 0) {
                tree[key].ch[''] = {
                    'svSynthetic': true,
                    't': rem,
                    'svTotal': rem,
                    'ch': {}
                };
            }
        }

        return tree;
    }

});
define('flame-ui/templates/application', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 1,
            "column": 38
          }
        },
        "moduleName": "flame-ui/templates/application.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [
        ["inline","app-container",[],["transactions",["subexpr","@mut",[["get","model",["loc",[null,[1,31],[1,36]]]]],[],[]]],["loc",[null,[1,0],[1,38]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/app-container', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      var child0 = (function() {
        return {
          meta: {
            "fragmentReason": false,
            "revision": "Ember@2.2.0-beta.1",
            "loc": {
              "source": null,
              "start": {
                "line": 20,
                "column": 4
              },
              "end": {
                "line": 28,
                "column": 4
              }
            },
            "moduleName": "flame-ui/templates/components/app-container.hbs"
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment,1,1,contextualElement);
            return morphs;
          },
          statements: [
            ["inline","span-log",[],["span",["subexpr","@mut",[["get","span",["loc",[null,[22,26],[22,30]]]]],[],[]],"spanMode",["subexpr","@mut",[["get","spanMode",["loc",[null,[23,26],[23,34]]]]],[],[]],"log",["subexpr","@mut",[["get","spanLog",["loc",[null,[24,26],[24,33]]]]],[],[]],"selectMode","selectSpanMode","class","row-1"],["loc",[null,[21,8],[27,10]]]]
          ],
          locals: [],
          templates: []
        };
      }());
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 10,
              "column": 0
            },
            "end": {
              "line": 29,
              "column": 0
            }
          },
          "moduleName": "flame-ui/templates/components/app-container.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n\n");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(2);
          morphs[0] = dom.createMorphAt(fragment,1,1,contextualElement);
          morphs[1] = dom.createMorphAt(fragment,3,3,contextualElement);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [
          ["inline","flame-ui",[],["node",["subexpr","@mut",[["get","transaction",["loc",[null,[12,18],[12,29]]]]],[],[]],"op",["subexpr","@mut",[["get","aggregation",["loc",[null,[13,18],[13,29]]]]],[],[]],"data",["subexpr","@mut",[["get","transactionData",["loc",[null,[14,18],[14,33]]]]],[],[]],"select","selectSpan","class",["subexpr","@mut",[["get","chartPanelSize",["loc",[null,[16,18],[16,32]]]]],[],[]],"changeAggregation","changeAggregation"],["loc",[null,[11,4],[18,6]]]],
          ["block","if",[["get","span",["loc",[null,[20,10],[20,14]]]]],[],0,null,["loc",[null,[20,4],[28,11]]]]
        ],
        locals: [],
        templates: [child0]
      };
    }());
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type",
            "multiple-nodes"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 30,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/app-container.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(3);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        morphs[1] = dom.createMorphAt(fragment,2,2,contextualElement);
        morphs[2] = dom.createMorphAt(fragment,4,4,contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [
        ["inline","sd-header",[],["class","-fixed"],["loc",[null,[1,0],[1,28]]]],
        ["inline","transactions-table",[],["transactions",["subexpr","@mut",[["get","transactions",["loc",[null,[4,19],[4,31]]]]],[],[]],"selected",["subexpr","@mut",[["get","transaction",["loc",[null,[5,19],[5,30]]]]],[],[]],"select","selectTransaction","class","row-1"],["loc",[null,[3,0],[8,2]]]],
        ["block","if",[["get","transaction",["loc",[null,[10,6],[10,17]]]]],[],0,null,["loc",[null,[10,0],[29,7]]]]
      ],
      locals: [],
      templates: [child0]
    };
  }()));

});
define('flame-ui/templates/components/flame-ui', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      var child0 = (function() {
        var child0 = (function() {
          var child0 = (function() {
            return {
              meta: {
                "fragmentReason": false,
                "revision": "Ember@2.2.0-beta.1",
                "loc": {
                  "source": null,
                  "start": {
                    "line": 11,
                    "column": 20
                  },
                  "end": {
                    "line": 13,
                    "column": 20
                  }
                },
                "moduleName": "flame-ui/templates/components/flame-ui.hbs"
              },
              isEmpty: false,
              arity: 0,
              cachedFragment: null,
              hasRendered: false,
              buildFragment: function buildFragment(dom) {
                var el0 = dom.createDocumentFragment();
                var el1 = dom.createTextNode("                        ");
                dom.appendChild(el0, el1);
                var el1 = dom.createElement("button");
                var el2 = dom.createComment("");
                dom.appendChild(el1, el2);
                dom.appendChild(el0, el1);
                var el1 = dom.createTextNode("\n");
                dom.appendChild(el0, el1);
                return el0;
              },
              buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
                var element2 = dom.childAt(fragment, [1]);
                var morphs = new Array(2);
                morphs[0] = dom.createElementMorph(element2);
                morphs[1] = dom.createMorphAt(element2,0,0);
                return morphs;
              },
              statements: [
                ["element","action",["changeAggregation",["get","option.value",["loc",[null,[12,61],[12,73]]]]],[],["loc",[null,[12,32],[12,75]]]],
                ["content","option.name",["loc",[null,[12,76],[12,91]]]]
              ],
              locals: [],
              templates: []
            };
          }());
          return {
            meta: {
              "fragmentReason": false,
              "revision": "Ember@2.2.0-beta.1",
              "loc": {
                "source": null,
                "start": {
                  "line": 10,
                  "column": 16
                },
                "end": {
                  "line": 14,
                  "column": 16
                }
              },
              "moduleName": "flame-ui/templates/components/flame-ui.hbs"
            },
            isEmpty: false,
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createComment("");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
              dom.insertBoundary(fragment, 0);
              dom.insertBoundary(fragment, null);
              return morphs;
            },
            statements: [
              ["block","sd-tab-item",[],["value",["subexpr","@mut",[["get","option.value",["loc",[null,[11,41],[11,53]]]]],[],[]],"activeTab",["subexpr","@mut",[["get","list.activeTab",["loc",[null,[11,64],[11,78]]]]],[],[]],"activateTab","activateTab","registerTab","registerTab","targetObject",["subexpr","@mut",[["get","list",["loc",[null,[11,144],[11,148]]]]],[],[]]],0,null,["loc",[null,[11,20],[13,36]]]]
            ],
            locals: ["option"],
            templates: [child0]
          };
        }());
        return {
          meta: {
            "fragmentReason": false,
            "revision": "Ember@2.2.0-beta.1",
            "loc": {
              "source": null,
              "start": {
                "line": 9,
                "column": 12
              },
              "end": {
                "line": 15,
                "column": 12
              }
            },
            "moduleName": "flame-ui/templates/components/flame-ui.hbs"
          },
          isEmpty: false,
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [
            ["block","each",[["get","aggregationOptions",["loc",[null,[10,24],[10,42]]]]],[],0,null,["loc",[null,[10,16],[14,25]]]]
          ],
          locals: ["list"],
          templates: [child0]
        };
      }());
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 2,
              "column": 4
            },
            "end": {
              "line": 17,
              "column": 4
            }
          },
          "moduleName": "flame-ui/templates/components/flame-ui.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("        ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("h1");
          dom.setAttribute(el1,"class","title");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n\n        ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","spacer");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n\n        ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("span");
          dom.setAttribute(el1,"class","text");
          var el2 = dom.createTextNode("\n            Aggregate by\n");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("        ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(2);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]),0,0);
          morphs[1] = dom.createMorphAt(dom.childAt(fragment, [5]),1,1);
          return morphs;
        },
        statements: [
          ["content","node",["loc",[null,[3,26],[3,34]]]],
          ["block","sd-tabs-list",[],["activeTab",["subexpr","@mut",[["get","op",["loc",[null,[9,38],[9,40]]]]],[],[]]],0,null,["loc",[null,[9,12],[15,29]]]]
        ],
        locals: [],
        templates: [child0]
      };
    }());
    var child1 = (function() {
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 20,
              "column": 8
            },
            "end": {
              "line": 25,
              "column": 8
            }
          },
          "moduleName": "flame-ui/templates/components/flame-ui.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("            ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"id","chart");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n            ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"style","position: relative");
          var el2 = dom.createTextNode("\n                ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("div");
          dom.setAttribute(el2,"id","svPopout");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n            ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes() { return []; },
        statements: [

        ],
        locals: [],
        templates: []
      };
    }());
    var child2 = (function() {
      var child0 = (function() {
        var child0 = (function() {
          return {
            meta: {
              "fragmentReason": false,
              "revision": "Ember@2.2.0-beta.1",
              "loc": {
                "source": null,
                "start": {
                  "line": 35,
                  "column": 24
                },
                "end": {
                  "line": 40,
                  "column": 24
                }
              },
              "moduleName": "flame-ui/templates/components/flame-ui.hbs"
            },
            isEmpty: false,
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("                            ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("tr");
              dom.setAttribute(el1,"class","tr -no-border");
              var el2 = dom.createTextNode("\n                                ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -icon");
              var el3 = dom.createElement("i");
              dom.setAttribute(el3,"class","material-icons");
              var el4 = dom.createTextNode("lens");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                                ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -string");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                            ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var element0 = dom.childAt(fragment, [1]);
              var element1 = dom.childAt(element0, [1, 0]);
              var morphs = new Array(3);
              morphs[0] = dom.createAttrMorph(element0, 'style');
              morphs[1] = dom.createAttrMorph(element1, 'style');
              morphs[2] = dom.createMorphAt(dom.childAt(element0, [3]),0,0);
              return morphs;
            },
            statements: [
              ["attribute","style",["get","line.color",["loc",[null,[36,62],[36,72]]]]],
              ["attribute","style",["get","item.color",["loc",[null,[37,87],[37,97]]]]],
              ["content","item.name",["loc",[null,[38,55],[38,68]]]]
            ],
            locals: ["item"],
            templates: []
          };
        }());
        return {
          meta: {
            "fragmentReason": false,
            "revision": "Ember@2.2.0-beta.1",
            "loc": {
              "source": null,
              "start": {
                "line": 28,
                "column": 12
              },
              "end": {
                "line": 43,
                "column": 12
              }
            },
            "moduleName": "flame-ui/templates/components/flame-ui.hbs"
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("                ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("table");
            dom.setAttribute(el1,"class","table");
            var el2 = dom.createTextNode("\n                    ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("thead");
            dom.setAttribute(el2,"class","thead");
            var el3 = dom.createTextNode("\n                        ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("th");
            dom.setAttribute(el3,"class","th -icon");
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n                        ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("th");
            dom.setAttribute(el3,"class","th -string");
            var el4 = dom.createTextNode("Containers");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n                    ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n                    ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("tbody");
            dom.setAttribute(el2,"class","tbody -compact");
            var el3 = dom.createTextNode("\n");
            dom.appendChild(el2, el3);
            var el3 = dom.createComment("");
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("                    ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n                ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1, 3]),1,1);
            return morphs;
          },
          statements: [
            ["block","each",[["get","legendItems",["loc",[null,[35,32],[35,43]]]]],[],0,null,["loc",[null,[35,24],[40,33]]]]
          ],
          locals: [],
          templates: [child0]
        };
      }());
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 27,
              "column": 8
            },
            "end": {
              "line": 44,
              "column": 8
            }
          },
          "moduleName": "flame-ui/templates/components/flame-ui.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [
          ["block","sd-table",[],[],0,null,["loc",[null,[28,12],[43,25]]]]
        ],
        locals: [],
        templates: [child0]
      };
    }());
    var child3 = (function() {
      var child0 = (function() {
        var child0 = (function() {
          return {
            meta: {
              "fragmentReason": false,
              "revision": "Ember@2.2.0-beta.1",
              "loc": {
                "source": null,
                "start": {
                  "line": 55,
                  "column": 12
                },
                "end": {
                  "line": 58,
                  "column": 12
                }
              },
              "moduleName": "flame-ui/templates/components/flame-ui.hbs"
            },
            isEmpty: false,
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("                ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("br");
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n                ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("strong");
              var el2 = dom.createTextNode("NOTE: this node has ");
              dom.appendChild(el1, el2);
              var el2 = dom.createComment("");
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode(" childs. Only the slowest one is shown.");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var morphs = new Array(1);
              morphs[0] = dom.createMorphAt(dom.childAt(fragment, [3]),1,1);
              return morphs;
            },
            statements: [
              ["content","activeSpan.childCount",["loc",[null,[57,44],[57,69]]]]
            ],
            locals: [],
            templates: []
          };
        }());
        return {
          meta: {
            "fragmentReason": false,
            "revision": "Ember@2.2.0-beta.1",
            "loc": {
              "source": null,
              "start": {
                "line": 48,
                "column": 8
              },
              "end": {
                "line": 59,
                "column": 8
              }
            },
            "moduleName": "flame-ui/templates/components/flame-ui.hbs"
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("            ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("strong");
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode(" –");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n            Container:                      ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("b");
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n            Command Line:                   ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("b");
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n            Time in this node and childs:   ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("b");
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n            Time in this node:              ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("b");
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n\n");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(6);
            morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]),0,0);
            morphs[1] = dom.createMorphAt(dom.childAt(fragment, [3]),0,0);
            morphs[2] = dom.createMorphAt(dom.childAt(fragment, [5]),0,0);
            morphs[3] = dom.createMorphAt(dom.childAt(fragment, [7]),0,0);
            morphs[4] = dom.createMorphAt(dom.childAt(fragment, [9]),0,0);
            morphs[5] = dom.createMorphAt(fragment,11,11,contextualElement);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [
            ["content","activeSpan.name",["loc",[null,[49,20],[49,39]]]],
            ["content","activeSpan.container",["loc",[null,[50,47],[50,71]]]],
            ["content","activeSpan.container",["loc",[null,[51,47],[51,71]]]],
            ["content","activeSpan.container",["loc",[null,[52,47],[52,71]]]],
            ["content","activeSpan.timeInNode",["loc",[null,[53,47],[53,72]]]],
            ["block","if",[["get","activeSpan.childCount",["loc",[null,[55,18],[55,39]]]]],[],0,null,["loc",[null,[55,12],[58,19]]]]
          ],
          locals: [],
          templates: [child0]
        };
      }());
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 47,
              "column": 4
            },
            "end": {
              "line": 60,
              "column": 4
            }
          },
          "moduleName": "flame-ui/templates/components/flame-ui.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [
          ["block","if",[["get","activeSpan",["loc",[null,[48,14],[48,24]]]]],[],0,null,["loc",[null,[48,8],[59,15]]]]
        ],
        locals: [],
        templates: [child0]
      };
    }());
    return {
      meta: {
        "fragmentReason": {
          "name": "triple-curlies"
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 62,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/flame-ui.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","flex-scaffholding -column");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n    ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","flex-scaffholding -row flex-grow");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("    ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element3 = dom.childAt(fragment, [0]);
        var element4 = dom.childAt(element3, [3]);
        var morphs = new Array(4);
        morphs[0] = dom.createMorphAt(element3,1,1);
        morphs[1] = dom.createMorphAt(element4,1,1);
        morphs[2] = dom.createMorphAt(element4,3,3);
        morphs[3] = dom.createMorphAt(element3,5,5);
        return morphs;
      },
      statements: [
        ["block","sd-panel-header",[],[],0,null,["loc",[null,[2,4],[17,24]]]],
        ["block","sd-panel-content",[],["class","flex-grow -overflow-visible -flexbox"],1,null,["loc",[null,[20,8],[25,29]]]],
        ["block","sd-panel-sidebar",[],[],2,null,["loc",[null,[27,8],[44,29]]]],
        ["block","sd-panel-footer",[],[],3,null,["loc",[null,[47,4],[60,24]]]]
      ],
      locals: [],
      templates: [child0, child1, child2, child3]
    };
  }()));

});
define('flame-ui/templates/components/input-toggle', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type",
            "multiple-nodes"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 3,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/input-toggle.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("span");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [2]);
        var morphs = new Array(2);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        morphs[1] = dom.createElementMorph(element0);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [
        ["inline","input",[],["type","checkbox","name",["subexpr","@mut",[["get","name",["loc",[null,[1,29],[1,33]]]]],[],[]],"checked",["subexpr","@mut",[["get","checked",["loc",[null,[1,42],[1,49]]]]],[],[]],"disabled",["subexpr","@mut",[["get","disabled",["loc",[null,[1,59],[1,67]]]]],[],[]],"readonly",["subexpr","@mut",[["get","readonly",["loc",[null,[1,77],[1,85]]]]],[],[]]],["loc",[null,[1,0],[1,87]]]],
        ["element","action",["toggle"],[],["loc",[null,[2,6],[2,25]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/s-panel-sidebar', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/s-panel-sidebar.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [
        ["content","yield",["loc",[null,[1,0],[1,9]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/sd-dropdown-item', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      return {
        meta: {
          "fragmentReason": {
            "name": "missing-wrapper",
            "problems": [
              "wrong-type"
            ]
          },
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 3,
              "column": 0
            }
          },
          "moduleName": "flame-ui/templates/components/sd-dropdown-item.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment,1,1,contextualElement);
          return morphs;
        },
        statements: [
          ["content","yield",["loc",[null,[2,4],[2,13]]]]
        ],
        locals: [],
        templates: []
      };
    }());
    var child1 = (function() {
      var child0 = (function() {
        return {
          meta: {
            "fragmentReason": false,
            "revision": "Ember@2.2.0-beta.1",
            "loc": {
              "source": null,
              "start": {
                "line": 4,
                "column": 4
              },
              "end": {
                "line": 6,
                "column": 4
              }
            },
            "moduleName": "flame-ui/templates/components/sd-dropdown-item.hbs"
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("a");
            dom.setAttribute(el1,"href","#0");
            dom.setAttribute(el1,"class","item -selected");
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var element1 = dom.childAt(fragment, [1]);
            var morphs = new Array(2);
            morphs[0] = dom.createElementMorph(element1);
            morphs[1] = dom.createMorphAt(element1,0,0);
            return morphs;
          },
          statements: [
            ["element","action",["setDropdownStatus",false],[],["loc",[null,[5,44],[5,80]]]],
            ["content","item.name",["loc",[null,[5,81],[5,94]]]]
          ],
          locals: [],
          templates: []
        };
      }());
      var child1 = (function() {
        return {
          meta: {
            "fragmentReason": false,
            "revision": "Ember@2.2.0-beta.1",
            "loc": {
              "source": null,
              "start": {
                "line": 6,
                "column": 4
              },
              "end": {
                "line": 8,
                "column": 4
              }
            },
            "moduleName": "flame-ui/templates/components/sd-dropdown-item.hbs"
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("a");
            dom.setAttribute(el1,"href","#0");
            dom.setAttribute(el1,"class","item");
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var element0 = dom.childAt(fragment, [1]);
            var morphs = new Array(2);
            morphs[0] = dom.createElementMorph(element0);
            morphs[1] = dom.createMorphAt(element0,0,0);
            return morphs;
          },
          statements: [
            ["element","action",["selectOption",["get","item.value",["loc",[null,[7,58],[7,68]]]]],[],["loc",[null,[7,34],[7,70]]]],
            ["content","item.name",["loc",[null,[7,71],[7,84]]]]
          ],
          locals: [],
          templates: []
        };
      }());
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 3,
              "column": 0
            },
            "end": {
              "line": 9,
              "column": 0
            }
          },
          "moduleName": "flame-ui/templates/components/sd-dropdown-item.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [
          ["block","if",[["get","isSelected",["loc",[null,[4,10],[4,20]]]]],[],0,1,["loc",[null,[4,4],[8,11]]]]
        ],
        locals: [],
        templates: [child0, child1]
      };
    }());
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 10,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-dropdown-item.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [
        ["block","if",[["get","hasBlock",["loc",[null,[1,6],[1,14]]]]],[],0,1,["loc",[null,[1,0],[9,7]]]]
      ],
      locals: [],
      templates: [child0, child1]
    };
  }()));

});
define('flame-ui/templates/components/sd-dropdown-trigger', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-dropdown-trigger.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [
        ["content","yield",["loc",[null,[1,0],[1,9]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/sd-dropdown', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      return {
        meta: {
          "fragmentReason": {
            "name": "missing-wrapper",
            "problems": [
              "wrong-type"
            ]
          },
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 7,
              "column": 0
            }
          },
          "moduleName": "flame-ui/templates/components/sd-dropdown.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment,1,1,contextualElement);
          return morphs;
        },
        statements: [
          ["content","label",["loc",[null,[6,4],[6,13]]]]
        ],
        locals: [],
        templates: []
      };
    }());
    var child1 = (function() {
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 11,
              "column": 8
            },
            "end": {
              "line": 18,
              "column": 8
            }
          },
          "moduleName": "flame-ui/templates/components/sd-dropdown.hbs"
        },
        isEmpty: false,
        arity: 1,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("            ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment,1,1,contextualElement);
          return morphs;
        },
        statements: [
          ["inline","sd-dropdown-item",[],["item",["subexpr","@mut",[["get","item",["loc",[null,[13,36],[13,40]]]]],[],[]],"selectedOption",["subexpr","@mut",[["get","selectedOption",["loc",[null,[14,36],[14,50]]]]],[],[]],"selectOption","selectOption","setDropdownStatus","setDropdownStatus"],["loc",[null,[12,12],[17,10]]]]
        ],
        locals: ["item"],
        templates: []
      };
    }());
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type",
            "multiple-nodes"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 21,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-dropdown.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","sd-dropdown");
        var el2 = dom.createTextNode("\n    ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("ul");
        dom.setAttribute(el2,"class","list");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("    ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(2);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        morphs[1] = dom.createMorphAt(dom.childAt(fragment, [2, 1]),1,1);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [
        ["block","sd-dropdown-trigger",[],["class",["subexpr","@mut",[["get","buttonClasses",["loc",[null,[2,22],[2,35]]]]],[],[]],"toggleDropdown","toggleDropdown","setupHeight","setupHeight"],0,null,["loc",[null,[1,0],[7,24]]]],
        ["block","each",[["get","items",["loc",[null,[11,16],[11,21]]]]],[],1,null,["loc",[null,[11,8],[18,17]]]]
      ],
      locals: [],
      templates: [child0, child1]
    };
  }()));

});
define('flame-ui/templates/components/sd-header', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 2,
              "column": 4
            },
            "end": {
              "line": 4,
              "column": 4
            }
          },
          "moduleName": "flame-ui/templates/components/sd-header.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("        ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("img");
          dom.setAttribute(el1,"src","sysdig_white.svg");
          dom.setAttribute(el1,"onerror","this.src = 'sysdig_white.png'");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes() { return []; },
        statements: [

        ],
        locals: [],
        templates: []
      };
    }());
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "multiple-nodes"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 10,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-header.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("nav");
        dom.setAttribute(el1,"class","navigator -align-left");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","separator");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("nav");
        dom.setAttribute(el1,"class","navigator -align-right");
        var el2 = dom.createTextNode("\n    ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("a");
        dom.setAttribute(el2,"href","#");
        dom.setAttribute(el2,"class","item");
        var el3 = dom.createElement("i");
        dom.setAttribute(el3,"class","material-icons");
        var el4 = dom.createTextNode("help");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(dom.childAt(fragment, [0]),1,1);
        return morphs;
      },
      statements: [
        ["block","link-to",["index"],["class","logo"],0,null,["loc",[null,[2,4],[4,16]]]]
      ],
      locals: [],
      templates: [child0]
    };
  }()));

});
define('flame-ui/templates/components/sd-panel-content', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-panel-content.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [
        ["content","yield",["loc",[null,[1,0],[1,9]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/sd-panel-footer', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-panel-footer.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [
        ["content","yield",["loc",[null,[1,0],[1,9]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/sd-panel-header', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-panel-header.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [
        ["content","yield",["loc",[null,[1,0],[1,9]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/sd-panel', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-panel.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [
        ["content","yield",["loc",[null,[1,0],[1,9]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/sd-tab-item', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-tab-item.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [
        ["content","yield",["loc",[null,[1,0],[1,9]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/sd-table', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": false,
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 6,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-table.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        var el2 = dom.createTextNode("\n    ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("table");
        dom.setAttribute(el2,"class","table");
        var el3 = dom.createTextNode("\n        ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element0 = dom.childAt(fragment, [0]);
        var morphs = new Array(2);
        morphs[0] = dom.createAttrMorph(element0, 'class');
        morphs[1] = dom.createMorphAt(dom.childAt(element0, [1]),1,1);
        return morphs;
      },
      statements: [
        ["attribute","class",["subexpr","if",[["get","hasStickHeader",["loc",[null,[1,16],[1,30]]]],"sd-table-inner"],[],["loc",[null,[1,11],[1,49]]]]],
        ["content","yield",["loc",[null,[3,8],[3,17]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/sd-tabs-list', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 2,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/sd-tabs-list.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(1);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        dom.insertBoundary(fragment, 0);
        return morphs;
      },
      statements: [
        ["inline","yield",[["get","this",["loc",[null,[1,8],[1,12]]]]],[],["loc",[null,[1,0],[1,14]]]]
      ],
      locals: [],
      templates: []
    };
  }()));

});
define('flame-ui/templates/components/span-log', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      var child0 = (function() {
        var child0 = (function() {
          return {
            meta: {
              "fragmentReason": false,
              "revision": "Ember@2.2.0-beta.1",
              "loc": {
                "source": null,
                "start": {
                  "line": 6,
                  "column": 16
                },
                "end": {
                  "line": 8,
                  "column": 16
                }
              },
              "moduleName": "flame-ui/templates/components/span-log.hbs"
            },
            isEmpty: false,
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("                    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("button");
              var el2 = dom.createTextNode("this span only");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var element3 = dom.childAt(fragment, [1]);
              var morphs = new Array(1);
              morphs[0] = dom.createElementMorph(element3);
              return morphs;
            },
            statements: [
              ["element","action",["selectMode","SPAN"],[],["loc",[null,[7,28],[7,58]]]]
            ],
            locals: [],
            templates: []
          };
        }());
        var child1 = (function() {
          return {
            meta: {
              "fragmentReason": false,
              "revision": "Ember@2.2.0-beta.1",
              "loc": {
                "source": null,
                "start": {
                  "line": 9,
                  "column": 16
                },
                "end": {
                  "line": 11,
                  "column": 16
                }
              },
              "moduleName": "flame-ui/templates/components/span-log.hbs"
            },
            isEmpty: false,
            arity: 0,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("                    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("button");
              var el2 = dom.createTextNode("this span and children");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var element2 = dom.childAt(fragment, [1]);
              var morphs = new Array(1);
              morphs[0] = dom.createElementMorph(element2);
              return morphs;
            },
            statements: [
              ["element","action",["selectMode","SPAN_CHILD"],[],["loc",[null,[10,28],[10,64]]]]
            ],
            locals: [],
            templates: []
          };
        }());
        return {
          meta: {
            "fragmentReason": false,
            "revision": "Ember@2.2.0-beta.1",
            "loc": {
              "source": null,
              "start": {
                "line": 5,
                "column": 12
              },
              "end": {
                "line": 12,
                "column": 12
              }
            },
            "moduleName": "flame-ui/templates/components/span-log.hbs"
          },
          isEmpty: false,
          arity: 1,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(2);
            morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
            morphs[1] = dom.createMorphAt(fragment,1,1,contextualElement);
            dom.insertBoundary(fragment, 0);
            dom.insertBoundary(fragment, null);
            return morphs;
          },
          statements: [
            ["block","sd-tab-item",[],["value","1","activeTab",["subexpr","@mut",[["get","list.activeTab",["loc",[null,[6,51],[6,65]]]]],[],[]],"activateTab","activateTab","registerTab","registerTab","targetObject",["subexpr","@mut",[["get","list",["loc",[null,[6,131],[6,135]]]]],[],[]]],0,null,["loc",[null,[6,16],[8,32]]]],
            ["block","sd-tab-item",[],["value","2","activeTab",["subexpr","@mut",[["get","list.activeTab",["loc",[null,[9,51],[9,65]]]]],[],[]],"activateTab","activateTab","registerTab","registerTab","targetObject",["subexpr","@mut",[["get","list",["loc",[null,[9,131],[9,135]]]]],[],[]]],1,null,["loc",[null,[9,16],[11,32]]]]
          ],
          locals: ["list"],
          templates: [child0, child1]
        };
      }());
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 2,
              "column": 4
            },
            "end": {
              "line": 14,
              "column": 4
            }
          },
          "moduleName": "flame-ui/templates/components/span-log.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("        ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("span");
          dom.setAttribute(el1,"class","text");
          var el2 = dom.createTextNode("\n            Logs for\n");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("        ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(dom.childAt(fragment, [1]),1,1);
          return morphs;
        },
        statements: [
          ["block","sd-tabs-list",[],[],0,null,["loc",[null,[5,12],[12,29]]]]
        ],
        locals: [],
        templates: [child0]
      };
    }());
    var child1 = (function() {
      var child0 = (function() {
        var child0 = (function() {
          return {
            meta: {
              "fragmentReason": false,
              "revision": "Ember@2.2.0-beta.1",
              "loc": {
                "source": null,
                "start": {
                  "line": 34,
                  "column": 16
                },
                "end": {
                  "line": 42,
                  "column": 16
                }
              },
              "moduleName": "flame-ui/templates/components/span-log.hbs"
            },
            isEmpty: false,
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("                    ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("tr");
              dom.setAttribute(el1,"class","tr");
              var el2 = dom.createTextNode("\n                        ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -icon");
              var el3 = dom.createElement("i");
              dom.setAttribute(el3,"class","material-icons");
              var el4 = dom.createTextNode("lens");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                        ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -string");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                        ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -string");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                        ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -number");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                        ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -string");
              dom.setAttribute(el2,"colspan","3");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                    ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var element0 = dom.childAt(fragment, [1]);
              var element1 = dom.childAt(element0, [1, 0]);
              var morphs = new Array(6);
              morphs[0] = dom.createAttrMorph(element0, 'style');
              morphs[1] = dom.createAttrMorph(element1, 'style');
              morphs[2] = dom.createMorphAt(dom.childAt(element0, [3]),0,0);
              morphs[3] = dom.createMorphAt(dom.childAt(element0, [5]),0,0);
              morphs[4] = dom.createMorphAt(dom.childAt(element0, [7]),0,0);
              morphs[5] = dom.createMorphAt(dom.childAt(element0, [9]),0,0);
              return morphs;
            },
            statements: [
              ["attribute","style",["get","line.color",["loc",[null,[35,43],[35,53]]]]],
              ["attribute","style",["get","line.lineColor",["loc",[null,[36,79],[36,93]]]]],
              ["content","line.containerName",["loc",[null,[37,47],[37,69]]]],
              ["content","line.k",["loc",[null,[38,47],[38,57]]]],
              ["content","line.t",["loc",[null,[39,47],[39,57]]]],
              ["content","line.b",["loc",[null,[40,59],[40,69]]]]
            ],
            locals: ["line"],
            templates: []
          };
        }());
        return {
          meta: {
            "fragmentReason": false,
            "revision": "Ember@2.2.0-beta.1",
            "loc": {
              "source": null,
              "start": {
                "line": 17,
                "column": 8
              },
              "end": {
                "line": 44,
                "column": 8
              }
            },
            "moduleName": "flame-ui/templates/components/span-log.hbs"
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("            ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("thead");
            dom.setAttribute(el1,"class","thead");
            var el2 = dom.createTextNode("\n                ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("th");
            dom.setAttribute(el2,"class","th -icon");
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n                ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("th");
            dom.setAttribute(el2,"class","th -string");
            var el3 = dom.createTextNode("\n                    ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3,"class","th-inner");
            var el4 = dom.createTextNode("Container");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n                ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n                ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("th");
            dom.setAttribute(el2,"class","th -string");
            var el3 = dom.createTextNode("\n                    ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3,"class","th-inner");
            var el4 = dom.createTextNode("K");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n                        ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n                ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("th");
            dom.setAttribute(el2,"class","th -number");
            var el3 = dom.createTextNode("\n                    ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3,"class","th-inner");
            var el4 = dom.createTextNode("Date and Time");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n                ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n                ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("th");
            dom.setAttribute(el2,"class","th -string");
            dom.setAttribute(el2,"colspan","3");
            var el3 = dom.createTextNode("\n                    ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3,"class","th-inner");
            var el4 = dom.createTextNode("Message");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n                ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n            ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n            ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("tbody");
            dom.setAttribute(el1,"class","tbody -compact");
            var el2 = dom.createTextNode("\n");
            dom.appendChild(el1, el2);
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("            ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(dom.childAt(fragment, [3]),1,1);
            return morphs;
          },
          statements: [
            ["block","each",[["get","lines",["loc",[null,[34,24],[34,29]]]]],["key","@index"],0,null,["loc",[null,[34,16],[42,25]]]]
          ],
          locals: [],
          templates: [child0]
        };
      }());
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 16,
              "column": 4
            },
            "end": {
              "line": 45,
              "column": 4
            }
          },
          "moduleName": "flame-ui/templates/components/span-log.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [
          ["block","sd-table",[],["sticky",true],0,null,["loc",[null,[17,8],[44,21]]]]
        ],
        locals: [],
        templates: [child0]
      };
    }());
    return {
      meta: {
        "fragmentReason": {
          "name": "triple-curlies"
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 47,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/span-log.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","flex-scaffholding -column");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var element4 = dom.childAt(fragment, [0]);
        var morphs = new Array(2);
        morphs[0] = dom.createMorphAt(element4,1,1);
        morphs[1] = dom.createMorphAt(element4,3,3);
        return morphs;
      },
      statements: [
        ["block","sd-panel-header",[],[],0,null,["loc",[null,[2,4],[14,24]]]],
        ["block","sd-panel-content",[],["class","flex-grow -no-padding -flexbox"],1,null,["loc",[null,[16,4],[45,25]]]]
      ],
      locals: [],
      templates: [child0, child1]
    };
  }()));

});
define('flame-ui/templates/components/transactions-table', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      return {
        meta: {
          "fragmentReason": {
            "name": "triple-curlies"
          },
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 1,
              "column": 0
            },
            "end": {
              "line": 3,
              "column": 0
            }
          },
          "moduleName": "flame-ui/templates/components/transactions-table.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("h1");
          dom.setAttribute(el1,"class","title");
          var el2 = dom.createTextNode("Transactions");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes() { return []; },
        statements: [

        ],
        locals: [],
        templates: []
      };
    }());
    var child1 = (function() {
      var child0 = (function() {
        var child0 = (function() {
          return {
            meta: {
              "fragmentReason": false,
              "revision": "Ember@2.2.0-beta.1",
              "loc": {
                "source": null,
                "start": {
                  "line": 25,
                  "column": 12
                },
                "end": {
                  "line": 33,
                  "column": 12
                }
              },
              "moduleName": "flame-ui/templates/components/transactions-table.hbs"
            },
            isEmpty: false,
            arity: 1,
            cachedFragment: null,
            hasRendered: false,
            buildFragment: function buildFragment(dom) {
              var el0 = dom.createDocumentFragment();
              var el1 = dom.createTextNode("                ");
              dom.appendChild(el0, el1);
              var el1 = dom.createElement("tr");
              var el2 = dom.createTextNode("\n                    ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -string");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                    ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -number");
              var el3 = dom.createComment("");
              dom.appendChild(el2, el3);
              var el3 = dom.createTextNode(" calls");
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                    ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -number");
              var el3 = dom.createElement("a");
              dom.setAttribute(el3,"href","#0");
              var el4 = dom.createComment("");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                    ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -number");
              var el3 = dom.createElement("a");
              dom.setAttribute(el3,"href","#0");
              var el4 = dom.createComment("");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                    ");
              dom.appendChild(el1, el2);
              var el2 = dom.createElement("td");
              dom.setAttribute(el2,"class","td -number");
              var el3 = dom.createElement("a");
              dom.setAttribute(el3,"href","#0");
              var el4 = dom.createComment("");
              dom.appendChild(el3, el4);
              dom.appendChild(el2, el3);
              dom.appendChild(el1, el2);
              var el2 = dom.createTextNode("\n                ");
              dom.appendChild(el1, el2);
              dom.appendChild(el0, el1);
              var el1 = dom.createTextNode("\n");
              dom.appendChild(el0, el1);
              return el0;
            },
            buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
              var element0 = dom.childAt(fragment, [1]);
              var element1 = dom.childAt(element0, [5, 0]);
              var element2 = dom.childAt(element0, [7, 0]);
              var element3 = dom.childAt(element0, [9, 0]);
              var morphs = new Array(10);
              morphs[0] = dom.createAttrMorph(element0, 'class');
              morphs[1] = dom.createElementMorph(element0);
              morphs[2] = dom.createMorphAt(dom.childAt(element0, [1]),0,0);
              morphs[3] = dom.createMorphAt(dom.childAt(element0, [3]),0,0);
              morphs[4] = dom.createElementMorph(element1);
              morphs[5] = dom.createMorphAt(element1,0,0);
              morphs[6] = dom.createElementMorph(element2);
              morphs[7] = dom.createMorphAt(element2,0,0);
              morphs[8] = dom.createElementMorph(element3);
              morphs[9] = dom.createMorphAt(element3,0,0);
              return morphs;
            },
            statements: [
              ["attribute","class",["concat",["tr -link ",["subexpr","if",[["subexpr","is-equal",[],["a",["get","transaction.node",["loc",[null,[26,53],[26,69]]]],"b",["get","selected",["loc",[null,[26,72],[26,80]]]]],["loc",[null,[26,41],[26,81]]]],"-selected"],[],["loc",[null,[26,36],[26,95]]]]]]],
              ["element","action",["select",["get","transaction.node",["loc",[null,[26,115],[26,131]]]]],[],["loc",[null,[26,97],[26,133]]]],
              ["content","transaction.node",["loc",[null,[27,43],[27,63]]]],
              ["content","transaction.n",["loc",[null,[28,43],[28,60]]]],
              ["element","action",["select",["get","transaction.node",["loc",[null,[29,74],[29,90]]]],"avg"],["bubbles",false],["loc",[null,[29,56],[29,112]]]],
              ["content","transaction.avg",["loc",[null,[29,113],[29,132]]]],
              ["element","action",["select",["get","transaction.node",["loc",[null,[30,74],[30,90]]]],"min"],["bubbles",false],["loc",[null,[30,56],[30,112]]]],
              ["content","transaction.min",["loc",[null,[30,113],[30,132]]]],
              ["element","action",["select",["get","transaction.node",["loc",[null,[31,74],[31,90]]]],"max"],["bubbles",false],["loc",[null,[31,56],[31,112]]]],
              ["content","transaction.max",["loc",[null,[31,113],[31,132]]]]
            ],
            locals: ["transaction"],
            templates: []
          };
        }());
        return {
          meta: {
            "fragmentReason": false,
            "revision": "Ember@2.2.0-beta.1",
            "loc": {
              "source": null,
              "start": {
                "line": 6,
                "column": 4
              },
              "end": {
                "line": 35,
                "column": 4
              }
            },
            "moduleName": "flame-ui/templates/components/transactions-table.hbs"
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("thead");
            dom.setAttribute(el1,"class","thead");
            var el2 = dom.createTextNode("\n            ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("th");
            dom.setAttribute(el2,"class","th -string");
            var el3 = dom.createTextNode("\n                ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3,"class","th-inner");
            var el4 = dom.createTextNode("Node");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n            ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("th");
            dom.setAttribute(el2,"class","th -number");
            var el3 = dom.createTextNode("\n                ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3,"class","th-inner");
            var el4 = dom.createTextNode("Calls");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n            ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("th");
            dom.setAttribute(el2,"class","th -number");
            var el3 = dom.createTextNode("\n                ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3,"class","th-inner");
            var el4 = dom.createTextNode("Avg Time");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n            ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("th");
            dom.setAttribute(el2,"class","th -number");
            var el3 = dom.createTextNode("\n                ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3,"class","th-inner");
            var el4 = dom.createTextNode("Min Time");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n            ");
            dom.appendChild(el1, el2);
            var el2 = dom.createElement("th");
            dom.setAttribute(el2,"class","th -number");
            var el3 = dom.createTextNode("\n                ");
            dom.appendChild(el2, el3);
            var el3 = dom.createElement("div");
            dom.setAttribute(el3,"class","th-inner");
            var el4 = dom.createTextNode("Max Time");
            dom.appendChild(el3, el4);
            dom.appendChild(el2, el3);
            var el3 = dom.createTextNode("\n            ");
            dom.appendChild(el2, el3);
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("tbody");
            dom.setAttribute(el1,"class","tbody");
            var el2 = dom.createTextNode("\n");
            dom.appendChild(el1, el2);
            var el2 = dom.createComment("");
            dom.appendChild(el1, el2);
            var el2 = dom.createTextNode("        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
            var morphs = new Array(1);
            morphs[0] = dom.createMorphAt(dom.childAt(fragment, [3]),1,1);
            return morphs;
          },
          statements: [
            ["block","each",[["get","transactions",["loc",[null,[25,20],[25,32]]]]],[],0,null,["loc",[null,[25,12],[33,21]]]]
          ],
          locals: [],
          templates: [child0]
        };
      }());
      return {
        meta: {
          "fragmentReason": false,
          "revision": "Ember@2.2.0-beta.1",
          "loc": {
            "source": null,
            "start": {
              "line": 5,
              "column": 0
            },
            "end": {
              "line": 36,
              "column": 0
            }
          },
          "moduleName": "flame-ui/templates/components/transactions-table.hbs"
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [
          ["block","sd-table",[],["sticky",true],0,null,["loc",[null,[6,4],[35,17]]]]
        ],
        locals: [],
        templates: [child0]
      };
    }());
    return {
      meta: {
        "fragmentReason": {
          "name": "missing-wrapper",
          "problems": [
            "wrong-type",
            "multiple-nodes"
          ]
        },
        "revision": "Ember@2.2.0-beta.1",
        "loc": {
          "source": null,
          "start": {
            "line": 1,
            "column": 0
          },
          "end": {
            "line": 37,
            "column": 0
          }
        },
        "moduleName": "flame-ui/templates/components/transactions-table.hbs"
      },
      isEmpty: false,
      arity: 0,
      cachedFragment: null,
      hasRendered: false,
      buildFragment: function buildFragment(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        return el0;
      },
      buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
        var morphs = new Array(2);
        morphs[0] = dom.createMorphAt(fragment,0,0,contextualElement);
        morphs[1] = dom.createMorphAt(fragment,2,2,contextualElement);
        dom.insertBoundary(fragment, 0);
        dom.insertBoundary(fragment, null);
        return morphs;
      },
      statements: [
        ["block","sd-panel-header",[],[],0,null,["loc",[null,[1,0],[3,20]]]],
        ["block","sd-panel-content",[],["class","-no-padding -flexbox"],1,null,["loc",[null,[5,0],[36,21]]]]
      ],
      locals: [],
      templates: [child0, child1]
    };
  }()));

});
define('flame-ui/tests/app.jshint', function () {

  'use strict';

  QUnit.module('JSHint - app.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'app.js should pass jshint.');
  });

});
define('flame-ui/tests/components/app-container.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/app-container.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/app-container.js should pass jshint.');
  });

});
define('flame-ui/tests/components/flame-ui.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/flame-ui.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/flame-ui.js should pass jshint.');
  });

});
define('flame-ui/tests/components/input-toggle.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/input-toggle.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/input-toggle.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-dropdown-item.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-dropdown-item.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-dropdown-item.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-dropdown-trigger.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-dropdown-trigger.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-dropdown-trigger.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-dropdown.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-dropdown.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-dropdown.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-header.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-header.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-header.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-panel-content.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-panel-content.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-panel-content.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-panel-footer.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-panel-footer.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-panel-footer.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-panel-header.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-panel-header.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-panel-header.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-panel-sidebar.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-panel-sidebar.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-panel-sidebar.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-panel.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-panel.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-panel.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-tab-item.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-tab-item.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-tab-item.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-table.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-table.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-table.js should pass jshint.');
  });

});
define('flame-ui/tests/components/sd-tabs-list.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/sd-tabs-list.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/sd-tabs-list.js should pass jshint.');
  });

});
define('flame-ui/tests/components/span-log.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/span-log.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/span-log.js should pass jshint.');
  });

});
define('flame-ui/tests/components/transactions-table.jshint', function () {

  'use strict';

  QUnit.module('JSHint - components/transactions-table.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'components/transactions-table.js should pass jshint.');
  });

});
define('flame-ui/tests/helpers/fmt-time-interval.jshint', function () {

  'use strict';

  QUnit.module('JSHint - helpers/fmt-time-interval.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'helpers/fmt-time-interval.js should pass jshint.');
  });

});
define('flame-ui/tests/helpers/fmtTimeInterval.jshint', function () {

  'use strict';

  QUnit.module('JSHint - helpers/fmtTimeInterval.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'helpers/fmtTimeInterval.js should pass jshint.');
  });

});
define('flame-ui/tests/helpers/is-equal.jshint', function () {

  'use strict';

  QUnit.module('JSHint - helpers/is-equal.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'helpers/is-equal.js should pass jshint.');
  });

});
define('flame-ui/tests/helpers/resolver', ['exports', 'ember/resolver', 'flame-ui/config/environment'], function (exports, Resolver, config) {

  'use strict';

  var resolver = Resolver['default'].create();

  resolver.namespace = {
    modulePrefix: config['default'].modulePrefix,
    podModulePrefix: config['default'].podModulePrefix
  };

  exports['default'] = resolver;

});
define('flame-ui/tests/helpers/resolver.jshint', function () {

  'use strict';

  QUnit.module('JSHint - helpers/resolver.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'helpers/resolver.js should pass jshint.');
  });

});
define('flame-ui/tests/helpers/start-app', ['exports', 'ember', 'flame-ui/app', 'flame-ui/config/environment'], function (exports, Ember, Application, config) {

  'use strict';



  exports['default'] = startApp;
  function startApp(attrs) {
    var application;

    var attributes = Ember['default'].merge({}, config['default'].APP);
    attributes = Ember['default'].merge(attributes, attrs); // use defaults, but you can override;

    Ember['default'].run(function () {
      application = Application['default'].create(attributes);
      application.setupForTesting();
      application.injectTestHelpers();
    });

    return application;
  }

});
define('flame-ui/tests/helpers/start-app.jshint', function () {

  'use strict';

  QUnit.module('JSHint - helpers/start-app.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'helpers/start-app.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/input-toggle-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('input-toggle', 'Integration | Component | input toggle', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 16
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'input-toggle', ['loc', [null, [1, 0], [1, 16]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'input-toggle', [], [], 0, null, ['loc', [null, [2, 4], [4, 21]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/input-toggle-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/input-toggle-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/input-toggle-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-dropdown-item-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-dropdown-item', 'Integration | Component | sd dropdown item', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 20
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-dropdown-item', ['loc', [null, [1, 0], [1, 20]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-dropdown-item', [], [], 0, null, ['loc', [null, [2, 4], [4, 25]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-dropdown-item-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-dropdown-item-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-dropdown-item-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-dropdown-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-dropdown', 'Integration | Component | sd dropdown', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 15
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-dropdown', ['loc', [null, [1, 0], [1, 15]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-dropdown', [], [], 0, null, ['loc', [null, [2, 4], [4, 20]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-dropdown-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-dropdown-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-dropdown-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-dropdown-trigger-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-dropdown-trigger', 'Integration | Component | sd dropdown trigger', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 23
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-dropdown-trigger', ['loc', [null, [1, 0], [1, 23]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-dropdown-trigger', [], [], 0, null, ['loc', [null, [2, 4], [4, 28]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-dropdown-trigger-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-dropdown-trigger-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-dropdown-trigger-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-header-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-header', 'Integration | Component | sd header', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 13
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-header', ['loc', [null, [1, 0], [1, 13]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-header', [], [], 0, null, ['loc', [null, [2, 4], [4, 18]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-header-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-header-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-header-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-panel-content-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-panel-content', 'Integration | Component | sd panel content', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 20
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-panel-content', ['loc', [null, [1, 0], [1, 20]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-panel-content', [], [], 0, null, ['loc', [null, [2, 4], [4, 25]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-panel-content-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-panel-content-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-panel-content-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-panel-footer-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-panel-footer', 'Integration | Component | s panel footer', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 19
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-panel-footer', ['loc', [null, [1, 0], [1, 19]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-panel-footer', [], [], 0, null, ['loc', [null, [2, 4], [4, 24]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-panel-footer-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-panel-footer-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-panel-footer-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-panel-header-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-panel-header', 'Integration | Component | s panel header', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 19
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-panel-header', ['loc', [null, [1, 0], [1, 19]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-panel-header', [], [], 0, null, ['loc', [null, [2, 4], [4, 24]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-panel-header-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-panel-header-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-panel-header-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-panel-sidebar-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-panel-sidebar', 'Integration | Component | s panel sidebar', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 20
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-panel-sidebar', ['loc', [null, [1, 0], [1, 20]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-panel-sidebar', [], [], 0, null, ['loc', [null, [2, 4], [4, 25]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-panel-sidebar-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-panel-sidebar-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-panel-sidebar-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-panel-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-panel', 'Integration | Component | s panel', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 12
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-panel', ['loc', [null, [1, 0], [1, 12]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-panel', [], [], 0, null, ['loc', [null, [2, 4], [4, 17]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-panel-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-panel-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-panel-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-tab-item-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-tab-item', 'Integration | Component | sd tab item', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 15
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-tab-item', ['loc', [null, [1, 0], [1, 15]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-tab-item', [], [], 0, null, ['loc', [null, [2, 4], [4, 20]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-tab-item-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-tab-item-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-tab-item-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-table-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-table', 'Integration | Component | sd table', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 12
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-table', ['loc', [null, [1, 0], [1, 12]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-table', [], [], 0, null, ['loc', [null, [2, 4], [4, 17]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-table-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-table-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-table-test.js should pass jshint.');
  });

});
define('flame-ui/tests/integration/components/sd-tabs-list-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForComponent('sd-tabs-list', 'Integration | Component | sd tabs list', {
    integration: true
  });

  ember_qunit.test('it renders', function (assert) {
    assert.expect(2);

    // Set any properties with this.set('myProperty', 'value');
    // Handle any actions with this.on('myAction', function(val) { ... });

    this.render(Ember.HTMLBars.template((function () {
      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 1,
              'column': 16
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 0, 0, contextualElement);
          dom.insertBoundary(fragment, 0);
          dom.insertBoundary(fragment, null);
          return morphs;
        },
        statements: [['content', 'sd-tabs-list', ['loc', [null, [1, 0], [1, 16]]]]],
        locals: [],
        templates: []
      };
    })()));

    assert.equal(this.$().text().trim(), '');

    // Template block usage:
    this.render(Ember.HTMLBars.template((function () {
      var child0 = (function () {
        return {
          meta: {
            'fragmentReason': false,
            'revision': 'Ember@2.2.0-beta.1',
            'loc': {
              'source': null,
              'start': {
                'line': 2,
                'column': 4
              },
              'end': {
                'line': 4,
                'column': 4
              }
            }
          },
          isEmpty: false,
          arity: 0,
          cachedFragment: null,
          hasRendered: false,
          buildFragment: function buildFragment(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode('      template block text\n');
            dom.appendChild(el0, el1);
            return el0;
          },
          buildRenderNodes: function buildRenderNodes() {
            return [];
          },
          statements: [],
          locals: [],
          templates: []
        };
      })();

      return {
        meta: {
          'fragmentReason': {
            'name': 'missing-wrapper',
            'problems': ['wrong-type']
          },
          'revision': 'Ember@2.2.0-beta.1',
          'loc': {
            'source': null,
            'start': {
              'line': 1,
              'column': 0
            },
            'end': {
              'line': 5,
              'column': 2
            }
          }
        },
        isEmpty: false,
        arity: 0,
        cachedFragment: null,
        hasRendered: false,
        buildFragment: function buildFragment(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode('\n');
          dom.appendChild(el0, el1);
          var el1 = dom.createComment('');
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode('  ');
          dom.appendChild(el0, el1);
          return el0;
        },
        buildRenderNodes: function buildRenderNodes(dom, fragment, contextualElement) {
          var morphs = new Array(1);
          morphs[0] = dom.createMorphAt(fragment, 1, 1, contextualElement);
          return morphs;
        },
        statements: [['block', 'sd-tabs-list', [], [], 0, null, ['loc', [null, [2, 4], [4, 21]]]]],
        locals: [],
        templates: [child0]
      };
    })()));

    assert.equal(this.$().text().trim(), 'template block text');
  });

});
define('flame-ui/tests/integration/components/sd-tabs-list-test.jshint', function () {

  'use strict';

  QUnit.module('JSHint - integration/components/sd-tabs-list-test.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'integration/components/sd-tabs-list-test.js should pass jshint.');
  });

});
define('flame-ui/tests/lib/flame-graph.jshint', function () {

  'use strict';

  QUnit.module('JSHint - lib/flame-graph.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'lib/flame-graph.js should pass jshint.');
  });

});
define('flame-ui/tests/mixins/clickElseWhere.jshint', function () {

  'use strict';

  QUnit.module('JSHint - mixins/clickElseWhere.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'mixins/clickElseWhere.js should pass jshint.');
  });

});
define('flame-ui/tests/router.jshint', function () {

  'use strict';

  QUnit.module('JSHint - router.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'router.js should pass jshint.');
  });

});
define('flame-ui/tests/routes/application.jshint', function () {

  'use strict';

  QUnit.module('JSHint - routes/application.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'routes/application.js should pass jshint.');
  });

});
define('flame-ui/tests/services/color-store.jshint', function () {

  'use strict';

  QUnit.module('JSHint - services/color-store.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'services/color-store.js should pass jshint.');
  });

});
define('flame-ui/tests/services/transaction-store.jshint', function () {

  'use strict';

  QUnit.module('JSHint - services/transaction-store.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'services/transaction-store.js should pass jshint.');
  });

});
define('flame-ui/tests/test-helper', ['flame-ui/tests/helpers/resolver', 'ember-qunit'], function (resolver, ember_qunit) {

	'use strict';

	ember_qunit.setResolver(resolver['default']);

});
define('flame-ui/tests/test-helper.jshint', function () {

  'use strict';

  QUnit.module('JSHint - test-helper.js');
  QUnit.test('should pass jshint', function(assert) {
    assert.expect(1);
    assert.ok(true, 'test-helper.js should pass jshint.');
  });

});
/* jshint ignore:start */

/* jshint ignore:end */

/* jshint ignore:start */

define('flame-ui/config/environment', ['ember'], function(Ember) {
  var prefix = 'flame-ui';
/* jshint ignore:start */

try {
  var metaName = prefix + '/config/environment';
  var rawConfig = Ember['default'].$('meta[name="' + metaName + '"]').attr('content');
  var config = JSON.parse(unescape(rawConfig));

  return { 'default': config };
}
catch(err) {
  throw new Error('Could not read config from meta tag with name "' + metaName + '".');
}

/* jshint ignore:end */

});

if (runningTests) {
  require("flame-ui/tests/test-helper");
} else {
  require("flame-ui/app")["default"].create({"name":"flame-ui","version":"0.0.0+39e30d70"});
}

/* jshint ignore:end */
//# sourceMappingURL=flame-ui.map
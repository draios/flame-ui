import Ember from 'ember';

var get = Ember.get;
var set = Ember.set;
var setProperties = Ember.setProperties;

export default Ember.Component.extend({
    transactionStore: Ember.inject.service(),

    classNames: ['sd-app-container'],

    init: function() {
        this._super.apply(this, arguments);

        setProperties(this, {
            transaction:        null,
            aggregation:        null,
            transactionData:    null,
            span:               null,
            spanMode:           null,
            spanLog:            null
        });
    },

    didInitAttrs: function() {
        this.selectTransaction(this.get('transactions')[0].node);
    },

    chartPanelSize: Ember.computed('span', function() {
        return (this.get('span')) ? 'row-2' : 'row-3';
    }),

    selectTransaction: function(transaction, aggregation) {
        var me = this;
        var currentAggregation = aggregation || get(me, 'aggregation') || 'avg';

        if (get(me, 'transaction') !== transaction || get(me, 'aggregation') !== currentAggregation) {
            setProperties(me, {
                transaction: transaction,
                aggregation: currentAggregation,
            });

            me.get('transactionStore').findTransaction(transaction, currentAggregation).then(function(result) {
                setProperties(me, {
                    transaction:        transaction,
                    aggregation:        currentAggregation,
                    transactionData:    result
                });
            });
        } else if (aggregation === undefined) {
            //
            // Remove selection when aggregation is not selected (i.e. not on links)
            //
            setProperties(me, {
                transaction:        null,
                transactionData:    null,
            });
        }
    },

    actions: {
        selectTransaction: function(transaction, aggregation) {
            this.selectTransaction(transaction, aggregation);
        },

        changeAggregation(aggregation) {
            var me          = this;
            var transaction = this.get('transaction');

            me.get('transactionStore').findTransaction(transaction, aggregation).then(function(result) {
                setProperties(me, {
                    transaction:        transaction,
                    aggregation:        aggregation,
                    transactionData:    result
                });
            });
        },

        selectSpan: function(span) {
            var me = this;
            var currentMode = get(this, 'spanMode') || 'SPAN';

            if (get(me, 'span') !== span) {
                setProperties(me, {
                    span:       span,
                    spanMode:   currentMode
                });

                get(me, 'transactionStore').findSpanLog(span, currentMode).then(function(result) {
                    setProperties(me, {
                        span:       span,
                        spanMode:   currentMode,
                        spanLog:    result
                    });
                });

                var spanMode = get(this, 'spanMode');
                if (spanMode) {
                    set(this, 'spanMode', null);
                    this.send('selectSpanMode', spanMode);
                }
            } else {
                setProperties(me, {
                    span:       null,
                });
            }
        },

        selectSpanMode: function(mode) {
            var me = this;
            var currentSpan = get(this, 'span');

            set(this, 'spanMode', mode);

            get(me, 'transactionStore').findSpanLog(currentSpan, mode).then(function(result) {
                setProperties(me, {
                    span:       currentSpan,
                    spanMode:   mode,
                    spanLog:    result
                });
            });
        }
    }
});

import Ember from 'ember';

//
// Table component
//
// If the component's parent is a flexbox, then the table will be scrollable with sticky header on its top
// otherwise it will act like a classic table
//

export default Ember.Component.extend({
    classNames:         [ 'sd-table', 'table-container' ],
    attributeBindings:  [ 'eqPts:data-eq-pts'],

    // Set sticky to true when your table needs a sticky_on_top header
    // remember to wrap your `th` content inside a `div.th-inner` and make sure the table is direct child of a flexbox
    sticky:         false,
    hasStickHeader: Ember.computed.oneWay('sticky'),

    // We apply this dummy property just to enable eq.js on this component and take advantage of the `eqResize` event
    eqPts: 'x:0',

    setupThead: Ember.on('didInsertElement', function() {
        this.updateThead(this.$('.thead'));
        this.$().on('eqResize', function() {
          this.updateThead(this.$('.thead'));
        }.bind(this));
    }),
    updateThead($thead) {
        $thead.find('th').each(function(index, th) {
            var $th          = this.$(th);
            var thInner      = $th.find('.th-inner')[0];
            var width        = $th.width();
            var paddingLeft  = (thInner) ? window.getComputedStyle(thInner).getPropertyValue('padding-left').slice(0, -2) : 0;
            var paddingRight = (thInner) ? window.getComputedStyle(thInner).getPropertyValue('padding-right').slice(0, -2) : 0;
            $th.find('.th-inner').width(width - paddingLeft - paddingRight); // TODO: get rid of the `- 20`
        }.bind(this));
    }
});

import Ember from 'ember';
import fmtTimeInterval from 'flame-ui/helpers/fmtTimeInterval';

export default Ember.Service.extend({
    colorStore: Ember.inject.service('color-store'),

    findAll() {
        return new Ember.RSVP.Promise(function(resolve) {
            Ember.run.next(function() {
                var data = {
                    avg: svFillData(window.transactions.avg),
                    min: svFillData(window.transactions.min),
                    max: svFillData(window.transactions.max)
                };
                var nodeIds = Object.keys(data.avg[''].ch);

                var transactions = nodeIds.map(function(node) {
                    return {
                        node:   node,
                        n:      data.avg[""].ch[node].n,
                        avg:    fmtTimeInterval(data.avg[""].ch[node].tt, 3, 1).output,
                        min:    fmtTimeInterval(data.min[""].ch[node].tt, 3, 1).output,
                        max:    fmtTimeInterval(data.max[""].ch[node].tt, 3, 1).output
                    };
                });

                resolve(transactions);
            });
        });
    },

    findTransaction(transaction, aggregation) {
        return new Ember.RSVP.Promise(function(resolve) {
            Ember.run.next(function() {
                var data;
                switch (aggregation) {
                    case 'avg':
                        data = svFillData(window.transactions.avg);
                        break;
                    case 'min':
                        data = svFillData(window.transactions.min);
                        break;
                    case 'max':
                        data = svFillData(window.transactions.max);
                        break;
                }

                resolve(createSubTree(data, transaction));
            });
        });
    },

    findSpanLog(span, spanMode) {
        var colorStore = this.get('colorStore');

        return new Ember.RSVP.Promise(function(resolve) {
            Ember.run.next(function() {
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
                        contCol:    contCol,
                        containerName:      containerName,
                        col:        col,
                        k:          loglist[j].k,
                        t:          loglist[j].t,
                        b:          loglist[j].b
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

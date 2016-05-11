var generators = require('yeoman-generator');
var pdc = require('pdc');

module.exports = generators.Base.extend({
    constructor: function () {
        generators.Base.apply(this, arguments);
    },
    testPandoc: function () {
        var done = this.async();
        var markdownString = this.fs.read(this.destinationPath('01_started_angular\\01_history\\02_ecmascript.md'));
        var $fs = this.fs;
        pdc(markdownString, 'markdown', 'html', function (error, result) {
            $fs.write('course\\sample.html', result);
            done(error);
        });
    }
});
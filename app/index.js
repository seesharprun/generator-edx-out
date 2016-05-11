var generators = require('yeoman-generator');
var json2xml = require('json2xml');
var uuid = require('node-uuid');
var readdir = require('readdir');
var targz = require('tar.gz');
var htmlEncode = require('js-htmlencode');
var pdc = require('pdc');
var firstLine = require('first-line');

var baseClass = generators.Base.extend({
    constructor: function () {
        generators.Base.apply(this, arguments);
    },
    pandocMDtoHTML: function (markdownString, writePath) {
        var done = this.async();        
        var $fs = this.fs;
        pdc(markdownString, 'markdown', 'html', function (error, result) {
            $fs.write(writePath, result);
            done(error);
        });
    }
});

module.exports = baseClass.extend({
    createCourseMetadata: function () {
        // Clear Dir If Exists
        this.fs.delete('course\\');
        
        // Gen Course Metadata
        var courseJson = this.fs.readJSON(this.destinationPath('course.json'));
        var courseXml = json2xml(courseJson, { attributes_key: 'attr' });
        this.fs.write('course/course.xml', courseXml);
        
        // Gen Course Structure
        var courseMetaJson = this.fs.readJSON(this.destinationPath('course_meta.json'));
        courseMetaJson.attr.start = htmlEncode(courseMetaJson.attr.start);
        courseMetaJson.attr.video_upload_pipeline = htmlEncode(courseMetaJson.attr.video_upload_pipeline);
        var courseMetaXml = json2xml(courseMetaJson, { attributes_key: 'attr' });
        courseMetaXml = courseMetaXml.replace('</course>', '\n');
        
        // Gen Chapters
        var chapterDirectories = readdir.readSync(this.destinationPath(), ['*/'], readdir.INCLUDE_DIRECTORIES + readdir.NON_RECURSIVE + readdir.CASELESS_SORT);
        for (var i = 0; i < chapterDirectories.length; i++) {
            var currentChapterDir = chapterDirectories[i];
            if (currentChapterDir === 'course/') {
                continue;
            }
            var sequentialXml = '';
            
            // Gen Sequentials
            var sequentialDirectories = readdir.readSync(this.destinationPath(currentChapterDir), ['*/'], readdir.INCLUDE_DIRECTORIES + readdir.NON_RECURSIVE + readdir.CASELESS_SORT);
            for (var j = 0; j < sequentialDirectories.length; j++) {
                var currentSequentialDir = sequentialDirectories[j];
                if (currentSequentialDir === 'files/' || currentSequentialDir === 'images/') {
                    continue;
                }
                var verticalXml = '';
                
                // Gen & Write Verticals & HTML
                var verticalFiles = readdir.readSync(this.destinationPath(currentChapterDir + currentSequentialDir), ['*.md'], readdir.NON_RECURSIVE + readdir.CASELESS_SORT);
                for (var k = 0; k < verticalFiles.length; k++) {
                    var currentFile = verticalFiles[k];
                    var currentFilePath = this.destinationPath(currentChapterDir + currentSequentialDir + currentFile);
                    var verticalId = uuid.v4().toLowerCase().replace('-', '');
                    var htmlId = uuid.v4().toLowerCase().replace('-', '');
                    var unitContents = this.fs.read(this.destinationPath(currentFilePath));
                    var unitName = unitContents.match(/^.*$/m)[0].replace('### ', '');
                     // Write Vertical
                    this.fs.copyTpl(
                        this.templatePath('vertical.xml'),
                        this.destinationPath('course/vertical/' + verticalId + '.xml'),
                        {
                            verticalName: unitName,
                            htmlId: htmlId
                        }
                    );
                    // Write HTML XML
                    this.fs.copyTpl(
                        this.templatePath('html.xml'),
                        this.destinationPath('course/html/' + htmlId + '.xml'),
                        {
                            htmlName: unitName,
                            htmlId: htmlId
                        }
                    ); 
                    this.pandocMDtoHTML(unitContents,'course/html/' + htmlId + '.html');
                    verticalXml += json2xml({ vertical: '', attr: { url_name: verticalId } }, { attributes_key: 'attr' }) + '\n'; 
                }
                
                // Write Sequentials
                var sequentialId = uuid.v4().toLowerCase().replace('-', '');
                var sequentialMeta = this.fs.readJSON(this.destinationPath(currentChapterDir + currentSequentialDir + 'section.json')); 
                this.fs.copyTpl(
                    this.templatePath('sequential.xml'),
                    this.destinationPath('course/sequential/' + sequentialId + '.xml'),
                    {
                        sequentialName: sequentialMeta.title,
                        verticalXml: verticalXml
                    }
                );
                sequentialXml += json2xml({ sequential: '', attr: { url_name: sequentialId } }, { attributes_key: 'attr' }) + '\n';
            }
            
            // Write Chapter
            var chapterId = uuid.v4().toLowerCase().replace('-', '');
            var chapterMeta = this.fs.readJSON(this.destinationPath(currentChapterDir + 'module.json'));
            this.fs.copyTpl(
                this.templatePath('chapter.xml'),
                this.destinationPath('course/chapter/' + chapterId + '.xml'),
                {
                    chapterName: chapterMeta.title,
                    sequentialXml: sequentialXml
                }
            );
            courseMetaXml += '<chapter url_name="' + chapterId + '" />\n';            
        }   
        courseMetaXml += '</course>';
        this.fs.write('course/course/course.xml', courseMetaXml);
        
        // Write Overview
        this.fs.copyTpl(
            this.templatePath('overview.html'),
            this.destinationPath('course/about/overview.html'),
            { }
        );
        
        // Write Assets
        this.fs.copyTpl(
            this.templatePath('assets.xml'),
            this.destinationPath('course/assets/assets.xml'),
            { }
        );
        
        // Write Policies
        this.fs.copyTpl(
            this.templatePath('assets.json'),
            this.destinationPath('course/policies/assets.json'),
            { }
        );
        this.fs.copyTpl(
            this.templatePath('grading_policy.json'),
            this.destinationPath('course/policies/course/grading_policy.json'),
            { }
        );
        this.fs.copyTpl(
            this.templatePath('policy.json'),
            this.destinationPath('course/policies/course/policy.json'),
            { }
        );
    },
    package: function () {
        //var targetPath = this.destinationPath('course');
        //targz().compress(targetPath, 'course.tar.gz');
    }
});
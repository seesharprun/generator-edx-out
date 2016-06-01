var generators = require('yeoman-generator');
var json2xml = require('json2xml');
var uuid = require('node-uuid');
var readdir = require('readdir');
var stringEscape = require('js-string-escape');
var htmlEncode = require('js-htmlencode');
var pdc = require('pdc');

var altUnitRegex = /^\[meta\](.*)/; 
var problemUnitRegex = /^\[meta\]\: \<problem\>/;
var problemUnitSplitRegex = /(<problem[\s\S]*?<\/problem>)/g; 
var videoUnitRegex = /^\[meta\]\: \<video\> \(([0-9a-z]{8}\-[0-9a-z]{4}\-[0-9a-z]{4}\-[0-9a-z]{4}\-[0-9a-z]{12})\)/; 
var unitNameRegex = /###\s(.*)/;

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

var baseClass = generators.Base.extend({
    constructor: function () {
        generators.Base.apply(this, arguments);
    },
    pandocMDtoHTML: function (markdownString, writePath, chapterPrefix) {
        var done = this.async();        
        var $fs = this.fs;
        pdc(markdownString, 'markdown', 'html', ['-fmarkdown-implicit_figures', '--no-highlight'], function (error, result) {
            var formattedResult = result
                .replaceAll('<img src="../images/', '<img src="/static/' + chapterPrefix + '_')
                .replaceAll('<a href="files/([a-z_]+.[a-z]+)">', '<a href="/static/' + chapterPrefix +'_$1" download="$1">')
                .replaceAll('<pre class="', '<pre class="prettyprint lang-')
                .concat('<script src="https://cdn.rawgit.com/google/code-prettify/master/loader/run_prettify.js?skin=default"></script>');
            $fs.write(writePath, formattedResult);
            done(error);
        });
    },
    copyChapterFiles: function (chapterDir, chapterPrefix) {
        var images = readdir.readSync(this.destinationPath(chapterDir + 'images/'), ['*.png', '*.jpg'], readdir.NON_RECURSIVE + readdir.CASELESS_SORT);
        for (var i = 0; i < images.length; i++) {
            var imagePath = this.destinationPath(chapterDir + 'images/') + images[i];
            var destPath = this.destinationPath('course/static/') + chapterPrefix + '_' + images[i]
            this.fs.copy(imagePath, destPath);
        }
        var files = readdir.readSync(this.destinationPath(chapterDir + 'files/'), ['*'], readdir.NON_RECURSIVE + readdir.CASELESS_SORT);
        for (var i = 0; i < files.length; i++) {
            var filePath = this.destinationPath(chapterDir + 'files/') + files[i];
            var destPath = this.destinationPath('course/static/') + chapterPrefix + '_' + files[i]
            this.fs.copy(filePath, destPath);
        }
    },
    writeProblemUnit: function (verticalId, unitContents, unitName) {
        var problems = unitContents.match(problemUnitSplitRegex);
        var problemItems = [];
        
        // Write Multiple Problem XML Files
        for (var i = 0; i < problems.length; i++) {
            var problemId = uuid.v4().toLowerCase().replace('-', '');
            this.fs.write('course/problem/' + problemId + '.xml', problems[i]);
            problemItems.push(problemId);            
        }
        
        // Write Single Vertical File
        this.fs.copyTpl(
            this.templatePath('vertical-problem.xml'),
            this.destinationPath('course/vertical/' + verticalId + '.xml'),
            {
                verticalName: unitName,
                problemItems: problemItems,
            }
        );
    },
    writeVideoUnit: function (verticalId, unitContents, unitName, edxVideoId, chapterPrefix) {
        var htmlId = uuid.v4().toLowerCase().replace('-', '');
        var videoId = uuid.v4().toLowerCase().replace('-', '');
         // Write Vertical
        this.fs.copyTpl(
            this.templatePath('vertical-video.xml'),
            this.destinationPath('course/vertical/' + verticalId + '.xml'),
            {
                verticalName: unitName,
                htmlId: htmlId,
                videoId: videoId
            }
        );
        // Write Video XML
        this.fs.copyTpl(
            this.templatePath('video.xml'),
            this.destinationPath('course/video/' + videoId + '.xml'),
            {
                videoName: unitName,
                videoId: videoId,
                edxVideoId: edxVideoId
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
        this.pandocMDtoHTML(unitContents,'course/html/' + htmlId + '.html', chapterPrefix);
    },
    writeHTMLUnit: function (verticalId, unitContents, unitName, chapterPrefix) {
        var htmlId = uuid.v4().toLowerCase().replace('-', '');
         // Write Vertical
        this.fs.copyTpl(
            this.templatePath('vertical.xml'),
            this.destinationPath('course/vertical/' + verticalId + '.xml'),
            {
                verticalName: unitName,
                htmlId: htmlId,
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
        this.pandocMDtoHTML(unitContents,'course/html/' + htmlId + '.html', chapterPrefix);
    },
    writeUnit: function (verticalId, currentFilePath, chapterPrefix) {
        var result = {
            isProblem: false,
            isVideo: false
        };
        var unitContents = this.fs.read(this.destinationPath(currentFilePath));
        var unitName = unitContents.match(unitNameRegex)[1];
        
        var altUnit = unitContents.match(altUnitRegex);
        if(altUnit) {
            var altUnitMetadata = altUnit[0];
            if (videoUnitRegex.test(altUnitMetadata)) {
                var edxVideoId = altUnitMetadata.match(videoUnitRegex)[1];
                this.writeVideoUnit(verticalId, unitContents, unitName, edxVideoId, chapterPrefix);
                result.isVideo = true;
            }  
            else if (problemUnitRegex.test(altUnitMetadata)) {
                unitContents = unitContents.replace(problemUnitRegex, '');
                this.writeProblemUnit(verticalId, unitContents, unitName);
                result.isProblem = true;
            }
            else {       
                this.writeHTMLUnit(verticalId, unitContents, unitName, chapterPrefix);
            }
        }
        else {
            this.writeHTMLUnit(verticalId, unitContents, unitName, chapterPrefix);
        }
        
        return result;
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
            if (currentChapterDir === 'course/' || currentChapterDir === '.git/') {
                continue;
            }
            var sequentialXml = '';
            
            // Copy Chapter Images
            var chapterPrefix = 'mod' + currentChapterDir.substring(0, 2);
            this.copyChapterFiles(currentChapterDir, chapterPrefix);
            
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
                    var unitResult = this.writeUnit(verticalId, currentFilePath, chapterPrefix);
                    verticalXml += json2xml({ vertical: '', attr: { url_name: verticalId } }, { attributes_key: 'attr' }) + '\n'; 
                }
                
                // Write Sequentials
                var sequentialId = uuid.v4().toLowerCase().replace('-', '');
                var sequentialMeta = this.fs.readJSON(this.destinationPath(currentChapterDir + currentSequentialDir + 'section.json'));
                var extraAttributes = unitResult.isProblem ? 'format="Homework" graded="true"' : ''; 
                this.fs.copyTpl(
                    this.templatePath('sequential.xml'),
                    this.destinationPath('course/sequential/' + sequentialId + '.xml'),
                    {
                        sequentialName: sequentialMeta.title,
                        verticalXml: verticalXml,
                        extraAttributes: extraAttributes
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
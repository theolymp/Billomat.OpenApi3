"use strict";

var through = require("through2"),
    yaml = require("js-yaml"),
    yamlinc = require("yaml-include"),
    PassThrough = require("stream").PassThrough,
    p = require('path'),
    gulp = require("gulp"),
    fs = require('fs');

var BETTER_YAML_INCLUDE_SCHEMA = yaml.Schema.create([
    new yaml.Type('tag:yaml.org,2002:include', {
        kind: 'scalar',
        resolve: yamlIncludeResolve,
        construct: yamlIncludeConstruct,
        defaultStyle: ""
    })
]);

function yamlIncludeConstruct(data) {
    var src, included, basepath, fullpath;
  
    basepath = yamlinc.getBasePath();
    fullpath = p.join(basepath, data);
  
    yamlinc.YAML_VISITED_FILES.push(fullpath.replace(basepath + p.sep, ''));
    src = fs.readFileSync(fullpath, 'utf8');
    included = yaml.load(src, {
      schema: BETTER_YAML_INCLUDE_SCHEMA,
      filename: fullpath
    });
  
    return included;
  }
  
  function yamlIncludeResolve(data) {
    return (typeof data === 'string');
  }




var betterYamlInclude = function(){

    return through.obj(function (file, enc, cb) {
        if (file.isNull()) {
            // return empty file
            return cb(null, file);
        }
        yamlinc.setBaseFile(file.path);
        if (file.isBuffer()) {
            var yml = yaml.load(file.contents.toString(enc), {
                schema: BETTER_YAML_INCLUDE_SCHEMA,
                filename: file.path
            });
            file.contents = Buffer.from(yaml.dump(yml), enc);
        }
        if (file.isStream()) {
            file.contents.setEncoding(enc);
            var ymlobj = yaml.load(file.contents.read(), {
                schema: BETTER_YAML_INCLUDE_SCHEMA,
                filename: file.path
            });
            var stream = new PassThrough();
            stream.write(yaml.dump(ymlobj));
            file.contents = file.contents.pipe(stream);
        }

        return cb(null, file);
    });

};




gulp.task("build", function () {
    return gulp.src("./Client/*.yaml")
        .pipe(betterYamlInclude())
        .pipe(gulp.dest("./dist/"));
});
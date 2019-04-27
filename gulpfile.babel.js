import OpenAPISchemaValidator from 'openapi-schema-validator';
import { number } from 'prop-types';

const through = require("through2"),
    yaml = require("js-yaml"),
    yamlinc = require("yaml-include"),
    {PassThrough} = require("stream"),
    p = require('path'),
    fs = require('fs'),
    glob = require("glob"),
    gulp = require('gulp');
const {watch, series} = gulp;

    function _betterTypeOf(x){
        return Array.isArray(x) ? 'array' : (typeof x);
    }

    function _reduce(a,b){
        const typeA = _betterTypeOf(a);
        const typeB = _betterTypeOf(b);

        switch(typeA){
            case 'object':
                if(Object.keys(a).length === 0){
                    return b;
                }
                a = Object.assign({}, a);
                switch(typeB){
                    case 'object':
                        Object.keys(b).forEach(key => {
                            if(a.hasOwnProperty(key)){
                                a[key] = _reduce(a[key], b[key]);
                            }
                            else{
                                a[key] = b[key];
                            }

                            
                        });
                        return a;
                    

                    case 'array':
                        if(Object.keys(a).length === 0){
                            return b;
                        }
                        b.forEach( (val, idx)  => a[idx] = val );
                        return a;
                        
                    
                    default:
                        if(Object.keys(a).length === 0){
                            return b;
                        }
                        throw `no merge rule ${typeA} <- ${typeB}`
                }
                
            
            case 'array':
                if(a.length === 0) {
                    return b;
                }
                a = a.slice(0);
                switch(typeB){
                    case 'object':
                        Object.keys(b).forEach((key) => {   
                            var obj = {};
                            obj[key] = b[key];
                            a.push(obj);
                        });
                        return a;
                    

                    case 'array':
                        return a.concat(b);

                    case 'string':
                        a.push(b);
                        return a;

                    default:
                        throw `no merge rule ${typeA} <- ${typeB}`
                }

            default:
                throw `no merge rule ${typeA} <- ${typeB}`
                return b;
        }
    }

    function mergeDeepYaml(...items){
        return items.reduce(_reduce);
    }

var _visitStack = [];

var types = [
    new yaml.Type('tag:yaml.org,2002:include', {
        kind: 'scalar',
        resolve: (data) => {
            return typeof data === 'string';
        },
        construct: constructIncludeTag

    }),
    new yaml.Type('tag:yaml.org,2002:reflectDirStructure', {
        kind: 'mapping',
        resolve: (data) => {
            return (typeof data === 'object') && data.path;
        },
        construct: constructReflectDirStructureTag,
        defaultStyle: ""
    })
];
types.push(...yamlinc.YAML_TYPES);


var BETTER_YAML_INCLUDE_SCHEMA = yaml.Schema.create(types);



function constructIncludeTag (data){
            
    let [last] = _visitStack.slice(-1);

    var filepath = p.resolve(yamlinc.getBasePath() + (last||''), data);

    var fileContents = fs.readFileSync(filepath, 'utf8');
    yamlinc.YAML_VISITED_FILES.push(filepath);
    var fileData = yaml.loadAll(fileContents, null, {
      schema: BETTER_YAML_INCLUDE_SCHEMA,
      filename: filepath
    });
    return mergeDeepYaml(...fileData);;
}

function constructReflectDirStructureTag(data) {
    var basepath = yamlinc.getBasePath();

    var relOrAbsPath = data.path;

    var replacements = data.replacements || {};
    
    
    var fullpath = p.join(basepath, relOrAbsPath);
    
    
    var files = glob.sync('**/*.yaml', {cwd: fullpath});

    var result = {};


    
    files.forEach(function(relPath){
        var curObj = result;
        var arrPath = relPath.split('/');
        
        var filepath = fullpath + '/' + relPath;

       
  
        arrPath = arrPath
        .map((pathSegment, idx, arr) => {

            // last segment, has extension
            if((idx + 1) === arr.length){
                const ext = p.extname(filepath);
                pathSegment = pathSegment.substr(0, pathSegment.length-ext.length);
            }

            Object.keys(replacements).forEach((k) => {
                if(pathSegment === null) return;

                const regexp = new RegExp(k, 'gm');
                if(replacements[k] === null)
                {
                    if(regexp.test(pathSegment))
                    {
                        pathSegment = null;
                    }
                    return;
                }
                
                pathSegment = pathSegment.replace(regexp, replacements[k]);
            });

            /*
                @TODO: check why "200" is string key
            if(/\d+/.test(pathSegment)){
                pathSegment = parseInt(pathSegment);
            }*/
            return pathSegment;
        })
        .filter(x => x !== null);


        var lastPathSegment =  arrPath.pop();
        arrPath.forEach((p) => {
            if(!curObj.hasOwnProperty(p)){
                curObj[p] = {};
            }
            curObj = curObj[p];                    
        });

        var dirname = fs.realpathSync(p.dirname(filepath));
        var relDir = dirname.replace(basepath, '');
        _visitStack.push(relDir);

        var fileContents = fs.readFileSync(filepath, 'utf8');
        
        

        if(fileContents){
            yamlinc.YAML_VISITED_FILES.push(filepath);
            var fileData = yaml.loadAll(fileContents, null, {
              schema: BETTER_YAML_INCLUDE_SCHEMA,
              filename: filepath
            });
            fileData = mergeDeepYaml(...fileData);
            //curObj = mergeDeepYaml(curObj, fileData);
            
            if(curObj.hasOwnProperty(lastPathSegment)){
                curObj[lastPathSegment] = mergeDeepYaml(curObj[lastPathSegment], fileData);
             }
             else{
                 curObj[lastPathSegment] = fileData;
             }               
        }
        _visitStack.pop();
    });
    return result;
}

var betterYamlInclude = function(returnJson){

    return through.obj(function (file, enc, cb) {
        if (file.isNull()) {
            // return empty file
            return cb(null, file);
        }
        yamlinc.setBaseFile(file.path);
       
        var obj = yaml.load(
                file.isBuffer() ? 
                    file.contents.toString(enc)
                :   file.contents.read() , {
            schema: BETTER_YAML_INCLUDE_SCHEMA,
            filename: file.path
        });

        if(file.isBuffer()){            
            file.contents = Buffer.from(yaml.dump(obj), enc);
        }
        else if(file.isStream()){
            file.contents.setEncoding(enc);
            var stream = new PassThrough();
            stream.write(yaml.dump(obj));
            file.contents = file.contents.pipe(stream);
        }
        
        return cb(null, file);
    });
};




const processYaml = function(){
    return gulp
        .src("./src/client.yaml")
        .pipe(betterYamlInclude())
        .pipe(gulp.dest("./dist/"));
};

const _validateYaml = function(){
    const validator = new OpenAPISchemaValidator({
        version: 3
    });
    return through.obj(function (file, enc, cb) {
        var ymlobj = yaml.load(file.isBuffer() ? 
        file.contents.toString(enc)
    :   file.contents.read(), {
            schema: BETTER_YAML_INCLUDE_SCHEMA,
            filename: file.path
        });
        var res = validator.validate(ymlobj);
        

        let errors = null;

        if(res.errors && res.errors.length){
            errors = res.errors.map(err => {
                return `\t${err.dataPath}: ${err.message} [${JSON.stringify(err.params)}]`;
            })
        }

        cb(errors ? 'Error validating schema: \r\n' + errors.join('\r\n'): null, file);
    });
};

const validateYaml = function(){
   return gulp
    .src("./src/client.yaml")
    .pipe(betterYamlInclude())
    .pipe(_validateYaml());
}



exports.build = processYaml;
exports.default = series(processYaml, validateYaml);
exports.validate = validateYaml;
exports.watch = () => watch(['./src/**/*.yaml'], series(processYaml, validateYaml));

var gulp = require("gulp"),
    yamlinc = require("gulp-yaml-include");

gulp.task("build", function () {
    return gulp.src("./Client/*.yaml")
        .pipe(yamlinc())
        .pipe(gulp.dest("./dist/"));
});
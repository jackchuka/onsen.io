var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var browserSync = require('browser-sync');
var argv = require('yargs').argv;
var gutil = require('gulp-util');
var del = require('del');
var runSequence = require('run-sequence');
var fs = require('fs');
var path = require('path');
var merge = require('merge-stream');
var siteGenerator = require('./modules/metalsmith');

//--

var lang = argv.lang === 'en' ? 'en' : 'ja';
var env = argv.production ? 'production' : 'staging';

gutil.log('Language: --lang=' + lang);
gutil.log('Environment: ' + env);
gutil.log('Source: \'./src/documents_' + lang + '\'');
gutil.log('Destination: \'./out_' + lang + '\'');

//////////////////////////////
// generate
//////////////////////////////
gulp.task('generate', ['less', 'metalsmith', 'blog', 'authors']);

//////////////////////////////
// blog
//////////////////////////////
gulp.task('blog', function(done) {
  siteGenerator(lang, env === 'staging').blog(done);
});

//////////////////////////////
// authors
//////////////////////////////
gulp.task('authors', function(done) {
  siteGenerator(lang, env === 'staging').authors(done);
});

//////////////////////////////
// metalsmith
//////////////////////////////
gulp.task('metalsmith', function(done) {
  siteGenerator(lang, env === 'staging').site(done);
});

//////////////////////////////
// imagemin
//////////////////////////////
gulp.task('imagemin-core', function() {
  return gulp.src('src/files/images/**/*')
    .pipe($.imagemin())
    .pipe(gulp.dest('src/files/images/'));
});

gulp.task('imagemin-blog', function() {
  return gulp.src('blog/content/images/**/*')
    .pipe($.imagemin())
    .pipe(gulp.dest('blog/content/images/'));
});

gulp.task('imagemin', ['imagemin-core', 'imagemin-blog']);

//////////////////////////////
// less
//////////////////////////////
gulp.task('less', function() {
  return gulp.src('src/less/style.less')
    .pipe($.plumber())
    .pipe($.less())
    .pipe($.autoprefixer({
      browsers: ['last 2 versions'],
      cascade: false
    }))
    .pipe($.cssmin())
    .pipe(gulp.dest('./out_' + lang + '/css/'));
});

//////////////////////////////
// clean
//////////////////////////////
gulp.task('clean', function(done) {
  del([
    'out_' + lang + '/*',
    '!out_' + lang + '/OnsenUI',
    '!out_' + lang + '/project-templates',
  ], done);
});

//////////////////////////////
// serve
//////////////////////////////
gulp.task('serve', ['generate'], function() {
  browserSync({
    server: {
      baseDir: 'out_' + lang,
      index: 'index.html'
    },
    notify: false,
    open: false,
    injectChanges: true
  });

  var options = {
    debounceDelay: 400
  };

  gulp.watch([
    'src/documents_' + lang + '/**/*',
    'OnsenUI/build/docs/' + lang + '/partials/*/*.html',
    'src/layouts/*',
    'src/misc/*',
    'src/partials/*',
    'src/files/**/*',
  ], options, function() {
    runSequence(['metalsmith', 'blog', 'authors'], function() {
      browserSync.reload();
    });
  });

  gulp.watch([
    'src/less/*'
  ], options, function() {
    runSequence('less', function() {
      browserSync.reload();
    });
  });

  if (lang === 'en') {
    gulp.watch([
      'blog/*',
      'blog/posts/*',
      'blog/authors/*',
      'blog/content/**/*',
      'src/partials/*',
      'src/layouts/blog.html.eco'
    ], options, function() {
      runSequence('blog', function() {
        browserSync.reload();
      });
    });
  }
});

//////////////////////////////
// deploy
//////////////////////////////
gulp.task('deploy', ['clean', 'generate'], function() {
  var aws,
    fn = 'aws_' + lang + (env == 'production' ? '_prod' : '') + '.json';

  try {
    aws = JSON.parse(fs.readFileSync(path.join(__dirname, fn)));
  } catch(e) {
  }

  if (!aws) {
    throw new Error(fn + ' is missing! Please create it before trying to deploy!');
  }

  var dst = 'out_' + lang;
  var publisher = $.awspublish.create(aws);

  var site = gulp.src([
    dst + '/**',
    '!' + dst + '/OnsenUI',
    '!' + dst + '/2/OnsenUI',
    '!' + dst + '/project-templates'
  ]);

  var templates = gulp.src('project-templates/gen/**')
    .pipe($.rename(function(path) {
      path.dirname = 'project-templates/gen/' + path.dirname;
    }));

  var build = gulp.src('OnsenUI/build/**')
    .pipe($.rename(function(path) {
      path.dirname = 'OnsenUI/build/' + path.dirname;
    }));

  var build2 = gulp.src('2/OnsenUI/build/**')
    .pipe($.rename(function(path) {
      path.dirname = '2/OnsenUI/build/' + path.dirname;
    }));

  var headers = env == 'production' ? {'Cache-Control': 'max-age=7200, no-transform, public'} : {'Cache-Control': 'no-cache'};

  var stream = merge(site, templates, build, build2)
    .pipe($.awspublish.gzip())
    .pipe(publisher.publish(headers))
    .pipe(publisher.sync())
    .pipe($.awspublish.reporter());

  return stream;
});

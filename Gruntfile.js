module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      files: ['*.js', 'test/**/*.js'],
        options: {
          globals: {
            jQuery: true,
            console: true,
            module: true,
            Promise: true
          }
        }
    },
    shell: {
      mocha: {
        options: {
          stdout: true
        },
        command: 'mocha'
      }
    },
    release: {
      options: {
        // Don't release to NPM since travis does this
        npm: false,
        npmtag: false,
        // default: 'release <%= version %>'
        commitMessage: 'Release <%= version %>'
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-release');

  grunt.registerTask('test', ['jshint', 'shell:mocha']);
};

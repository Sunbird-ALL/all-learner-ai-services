module.exports = {
  
    setupFiles: ['dotenv/config'],
  
    reporters: [
      'default',
      ['jest-html-reporters', {
        publicPath: './jest-coverage',
        filename: 'coverage-report.html',
        expand: true,
      }]
    ],
  };
  
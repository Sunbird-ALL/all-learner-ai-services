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
    coveragePathIgnorePatterns: [
      '/node_modules/', 
      '/dist/',         
      '/src/config/',
      '/src/main.ts',
      '/src/app.module.ts',
      '/src/app-cluster.service.ts',
      '/src/mysql/mysql.module.ts',
      '/src/mysql/scores.controller.ts',
      '/src/mysql/scores.service.ts'
    ],
  };
  
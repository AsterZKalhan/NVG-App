// Configuration Tailwind de l'application NVG.
// Le CSS est compilé au déploiement (voir .github/workflows/deploy.yml) :
// seules les classes réellement utilisées dans index.html et les scripts sont gardées.
module.exports = {
  darkMode: 'class',
  content: ['./*.html', './*.js'],
  theme: {
    extend: {
      colors: {
        brand: { dark: '#07090e', card: '#121722', border: '#1f293d', red: '#dc2626' }
      }
    }
  },
  plugins: []
};

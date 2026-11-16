// Configuration Tailwind du site du Tournoi des 9 Mondes.
// Compilée au déploiement (voir .github/workflows/deploy-tournament.yml) :
// seules les classes réellement utilisées dans index.html et les scripts sont gardées.
module.exports = {
  darkMode: 'class',
  content: ['./tournoi-site/index.html', './tournoi-site/*.js'],
  theme: {
    extend: {
      colors: {
        brand: { dark: '#07090e', card: '#121722', border: '#1f293d', red: '#dc2626', ember: '#f97316' }
      }
    }
  },
  plugins: []
};

# GRIOT — assistant web en français

Prototype web original inspiré d'une interface futuriste wakandaise. Ce n'est pas un produit officiel Marvel et il ne clone pas la voix d'un acteur.

## Fonctionnalités
- Interface responsive, messages écrits et réponses vocales via la synthèse vocale du navigateur.
- Reconnaissance vocale du navigateur (Chrome/Edge la prennent généralement en charge ; disponibilité variable selon le navigateur).
- Caméra activée uniquement après clic et permission explicite.
- Analyse d'une image via le modèle configuré quand l'utilisateur écrit « Que vois-tu ? » avec la caméra active.
- Connexion optionnelle à l'API OpenAI via un serveur Node. La clé reste dans `.env`, côté serveur.

## Lancer sur Windows, macOS ou Linux
1. Installe Node.js LTS depuis https://nodejs.org/
2. Décompresse le ZIP, puis ouvre un terminal dans le dossier `griot_web`.
3. Lance `npm install`.
4. Copie `.env.example` vers `.env`, puis remplace `colle_ta_cle_api_ici` par ta clé API.
5. Lance `npm start`.
6. Ouvre http://localhost:3000 dans Chrome ou Edge.
7. Autorise le microphone et la caméra quand le navigateur le demande.

Sans clé API, l'interface s'ouvre et le navigateur peut faire la synthèse vocale, mais les réponses IA et l'analyse d'image ne fonctionneront pas. L'utilisation de l'API peut être payante et nécessite un compte/API avec facturation appropriée.

## Sécurité et limites
- Ne publie jamais le fichier `.env` et ne mets jamais la clé API dans `app.js`.
- L'accès caméra est arrêté avec « Arrêter la caméra » ; les images ne sont envoyées au serveur que lorsqu'un message demandant une analyse visuelle est soumis.
- Pour un déploiement public, ajoute une authentification, des limites de requêtes et une protection contre les abus avant de partager le site.
- Les API du navigateur varient selon l'appareil et le navigateur. Pour microphone/caméra, utilise `localhost` ou un site HTTPS.

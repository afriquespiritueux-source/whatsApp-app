const express = require('express');
const axios = require('axios');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const app = express();
app.use(express.json());
app.use(express.static('public'));

// ⚠️ CONFIGURATION (À REMPLIR ABSOLUMENT)
cloudinary.config({ 
  cloud_name: 'isg597un', 
  api_key: '258228953483391',     // <-- À REMPLACER
  api_secret: 'bfaUrIGG7trkMEs0QTLTP7XDz-g', // <-- À REMPLACER
  secure: true 
});
const upload = multer({ storage: multer.memoryStorage() });
const WHATSAPP_TOKEN = "EAATttGsWz8kBS8dmMrUQjA8Kzsmd7VRaOfrPnZBYfloGJfJeAeK4IIBfx7mSluqBVESctdTz94zWrXHd0GNotUGeCzXWFgi10qUi8usNb7g9jolwSFTdMaO4TPfCUlhWhMEnG3vADHZA1d8ZBDFpyGXiOmSebnTGZACA1zpIoZB7ZBwBriqYhgXsbaZCxsU6wZDZD"; // <-- À REMPLACER
const PHONE_NUMBER_ID = "1360862047116900";
const SUPABASE_URL = "https://nppaqxfbsjtiguakfkat.supabase.co";
const SUPABASE_KEY = "sb_publishable_AndUnPjRmEA4Q7fsm037Kg_mkmFkN2W";
const VERIFY_TOKEN = "mon_token_secret_123";

console.log("Démarrage du serveur...");

// 1. VERIFICATION WEBHOOK (Meta)
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

// 2. RECEPTION DES MESSAGES
app.post('/webhook', async (req, res) => {
    console.log("--- Nouveau message reçu ---");
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            const value = body.entry[0].changes[0].value;
            if (value.messages && value.messages[0]) {
                const message = value.messages[0];
                let text = message.text ? message.text.body : "[Média]";
                let mediaUrl = null;

                // --- GESTION DES IMAGES ---
                if (message.image) {
                    text = "[Image reçue]";
                    try {
                        const mediaRes = await axios.get(`https://graph.facebook.com/v21.0/${message.image.id}`, {
                            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
                        });
                        const imageBuffer = await axios.get(mediaRes.data.url, {
                            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
                            responseType: 'arraybuffer'
                        });
                        const result = await new Promise((resolve, reject) => {
                            cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                                if (error) reject(error); else resolve(result);
                            }).end(imageBuffer.data);
                        });
                        mediaUrl = result.secure_url;
                    } catch (imgError) { console.log("Erreur image :", imgError.message); }
                }

                // --- GESTION DES AUDIOS ---
                if (message.audio) {
                    text = "[Audio reçu]";
                    try {
                        const mediaRes = await axios.get(`https://graph.facebook.com/v21.0/${message.audio.id}`, {
                            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
                        });
                        const audioBuffer = await axios.get(mediaRes.data.url, {
                            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
                            responseType: 'arraybuffer'
                        });
                        // 'video' est obligatoire pour que Cloudinary accepte l'audio
                        const result = await new Promise((resolve, reject) => {
                            cloudinary.uploader.upload_stream({ resource_type: 'video' }, (error, result) => {
                                if (error) reject(error); else resolve(result);
                            }).end(audioBuffer.data);
                        });
                        mediaUrl = result.secure_url;
                    } catch (audioError) { console.log("Erreur audio :", audioError.message); }
                }

                // --- ENREGISTREMENT DANS SUPABASE ---
                await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
                    contact_number: message.from,
                    contact_name: value.contacts[0].profile.name,
                    direction: 'inbound',
                    content: text,
                    is_read: false,
                    media_url: mediaUrl
                }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });
                
                console.log("Message enregistré dans Supabase !");

                // --- MESSAGE DE BIENVENUE ---
                try {
                    const checkRes = await axios.get(`${SUPABASE_URL}/rest/v1/messages?contact_number=eq.${message.from}&direction=eq.inbound&select=id`, {
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                    });
                    if (checkRes.data.length === 1) {
                        const welcomeMessage = "Merci de nous avoir contactés. Afin d’étudier votre dossier, nous vous prions de bien vouloir nous fournir les informations suivantes :\n\nCivilité : Monsieur / Madame\n1. Nom complet :\n2. Date de naissance :\n3. Nationalité :\n4. Ville de résidence :\n5. Numéro de téléphone / WhatsApp :\n6. Disposez-vous d’un passeport valide ? Oui / Non\n— Si oui, merci de joindre une photo de la page principale.\n7. Dans quel domaine avez-vous travaillé ? Quel métier avez-vous appris ou exercé ?\n8. Avez-vous déjà travaillé dans le domaine choisi ? Oui / Non\n— Si oui, pendant combien d’années ?\n9. Avez-vous un diplôme ou une attestation de formation ? Oui / Non\n10. Quelles langues parlez-vous ?\n\nMerci de nous transmettre ces informations accompagnées des documents demandés. Nous vous remercions par avance et restons à votre disposition.\n\nCordialement,\nGuichet Emplois au canada";
                        await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                            messaging_product: 'whatsapp', to: message.from, type: 'text', text: { body: welcomeMessage }
                        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });
                        console.log("Message de bienvenue envoyé !");
                    }
                } catch (welcomeError) { console.log("Erreur bienvenue :", welcomeError.message); }
            }
        }
        res.sendStatus(200);
    } catch (error) { 
        console.log("ERREUR réception :", error.message);
        res.sendStatus(500); 
    }
});

// 3. ENVOI DE TEXTE
app.post('/api/send', async (req, res) => {
    const { to, text } = req.body;
    try {
        const waRes = await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp', to: to, type: 'text', text: { body: text }
        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });

        await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
            contact_number: to, contact_name: 'Moi', direction: 'outbound', content: text, wa_message_id: waRes.data.messages[0].id, is_read: true
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });

        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 4. ENVOI DE PHOTO
app.post('/api/send-image', upload.single('image'), async (req, res) => {
    const { to } = req.body;
    try {
        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({ resource_type: 'auto' }, (error, result) => {
                if (error) reject(error); else resolve(result);
            }).end(req.file.buffer);
        });

        const waRes = await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp', to: to, type: 'image', image: { link: result.secure_url }
        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });

        await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
            contact_number: to, contact_name: 'Moi', direction: 'outbound', content: '[Image envoyée]', wa_message_id: waRes.data.messages[0].id, is_read: true, media_url: result.secure_url
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });

        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 5. MARQUER COMME LU
app.post('/api/mark-read', async (req, res) => {
    const { contact_number } = req.body;
    try {
        await axios.patch(`${SUPABASE_URL}/rest/v1/messages?contact_number=eq.${contact_number}&direction=eq.inbound`, {
            is_read: true
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/', (req, res) => { res.sendFile(__dirname + '/public/app.html'); });
app.listen(process.env.PORT || 10000, () => { console.log("Serveur prêt !"); });

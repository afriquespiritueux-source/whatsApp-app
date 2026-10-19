const express = require('express');
const axios = require('axios');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const app = express();
app.use(express.json());
app.use(express.static('public'));

// ⚠️ CONFIGURATION CLOUDINARY (À REMPLIR)
cloudinary.config({ 
  cloud_name: 'isg597un', 
  api_key: '258228953483391', // À remplacer
  api_secret: 'bfaUrIGG7trkMEs0QTLTP7XDz-g', // À remplacer
  secure: true 
});

const upload = multer({ storage: multer.memoryStorage() });
const VERIFY_TOKEN = "mon_token_secret_123";
// ⚠️ CONFIGURATION WHATSAPP (À REMPLIR)
const WHATSAPP_TOKEN = "EAATttGsWz8kBS4xuTKZApLUgEuBSHUfwna0625yZCZBA3XjegLWCUU3shk9qbnkrkH8XPMklAOBcnloH3ssoOdABmn1R1vHDiCYnpV7XhAAZCUchuV12SeMYUogtJZAJdpAfNG5c3hy2frZA5YiqJiQOIO1lGJcYW2wWqeutWBLS7uveBMnsqJBi30hJbrpwZDZD"; 
const PHONE_NUMBER_ID = "1360862047116900";
const SUPABASE_URL = "https://nppaqxfbsjtiguakfkat.supabase.co";
const SUPABASE_KEY = "sb_publishable_AndUnPjRmEA4Q7fsm037Kg_mkmFkN2W";

// Récupérer la photo de profil du client
async function getProfilePicture(number) {
    try {
        const response = await axios.get(`https://graph.facebook.com/v21.0/${number}?fields=profile_picture_url`, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
        return response.data.profile_picture_url || null;
    } catch (error) { return null; }
}

// Marquer comme lu (coches bleues chez le client)
async function markAsRead(messageId) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp', status: 'read', message_id: messageId
        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });
    } catch (error) {}
}

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            const value = body.entry[0].changes[0].value;
            if (value.messages && value.messages[0]) {
                const message = value.messages[0];
                const from = message.from;
                const name = value.contacts[0].profile.name;
                let text = "[Média]";
                if (message.text) text = message.text.body;
                if (message.image) text = "[Image reçue]";
                if (message.video) text = "[Vidéo reçue]";
                if (message.audio) text = "[Audio reçu]";
                
                const waMessageId = message.id;
                const photoUrl = await getProfilePicture(from);

                // Enregistrer dans Supabase (non lu)
                await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
                    contact_number: from,
                    contact_name: name,
                    direction: 'inbound',
                    content: text,
                    profile_picture: photoUrl,
                    wa_message_id: waMessageId,
                    is_read: false
                }, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }
                });

                // Marquer comme lu chez le client
                await markAsRead(waMessageId);
            }
        }
        res.sendStatus(200);
    } catch (error) { res.sendStatus(500); }
});

// Envoyer un message texte
app.post('/api/send', async (req, res) => {
    const { to, text } = req.body;
    try {
        const waResponse = await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp', to: to, type: 'text', text: { body: text }
        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });

        const waMessageId = waResponse.data.messages[0].id;

        await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
            contact_number: to, contact_name: 'Moi', direction: 'outbound', content: text, wa_message_id: waMessageId, is_read: true
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });

        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Envoyer une image/vidéo
app.post('/api/send-image', upload.single('image'), async (req, res) => {
    const { to } = req.body;
    try {
        // 1. Upload sur Cloudinary
        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({ resource_type: 'auto' }, (error, result) => {
                if (error) reject(error); else resolve(result);
            }).end(req.file.buffer);
        });

        // 2. Envoi à WhatsApp
        await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp', to: to, type: 'image', image: { link: result.secure_url }
        }, { headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` } });

        // 3. Enregistrement dans Supabase
        await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
            contact_number: to, contact_name: 'Moi', direction: 'outbound', content: '[Image envoyée]', is_read: true
        }, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' } });

        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Marquer les messages d'un contact comme LUS (quand on clique dessus)
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
app.listen(process.env.PORT || 10000);

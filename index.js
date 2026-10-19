const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ⚠️ CONFIGURATION (Remplacez par vos vraies clés)
const VERIFY_TOKEN = "mon_token_secret_123";
const WHATSAPP_TOKEN = "EAATttGsWz8kBS1BrfxcrGnxoWh6AWh7Wg0ilWZC5T7yFVWp4JWWrNR6lk3Et0NitcZAn0QZCQxNZBxTCvtXvpLdzr9SmH1gMIdWIjCK1WGElPZCUFc61Qjy28yfWgPIlL2sX1TF2d5H66WxxszUkZCw6WT2VkMbO6T5ZCZCZB1UHubQxe2NLi4eA5NhQCJZAjck9m5j7y3WZCttI0Dn4j6uaIEDqIBfrloFTCMhbQZDZD";
const PHONE_NUMBER_ID = "1360862047116900";
const SUPABASE_URL = "https://nppaqxfbsjtiguakfkat.supabase.co";
const SUPABASE_KEY = "sb_publishable_AndUnPjRmEA4Q7fsm037Kg_mkmFkN2W";

// 1. Vérification du Webhook par Meta
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

// 2. Réception des messages de WhatsApp
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            const value = body.entry[0].changes[0].value;
            if (value.messages && value.messages[0]) {
                const message = value.messages[0];
                const from = message.from;
                const name = value.contacts[0].profile.name;
                const text = message.text ? message.text.body : "[Média]";

                // Enregistrer dans Supabase
                await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
                    contact_number: from,
                    contact_name: name,
                    direction: 'inbound',
                    content: text
                }, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    }
                });
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Erreur:", error.message);
        res.sendStatus(500);
    }
});

// 3. Envoi de message depuis l'interface (API interne)
app.post('/api/send', async (req, res) => {
    const { to, text } = req.body;
    try {
        // Envoyer via WhatsApp
        await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: text }
        }, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });

        // Enregistrer dans Supabase
        await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
            contact_number: to,
            contact_name: 'Moi',
            direction: 'outbound',
            content: text
        }, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});

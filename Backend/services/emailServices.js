const { BrevoClient } = require("@getbrevo/brevo");

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

async function sendOtpEmail(toEmail, code) {
  try {
    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: "BusTrack" },
      to: [{ email: toEmail }],
      subject: "Your BusTrack verification code",
      htmlContent: `<p>Your verification code is <b>${code}</b>. It expires in 5 minutes.</p>`,
      textContent: `Your verification code is ${code}. It expires in 5 minutes.`,
    });

    return { delivered: true, data: response };
  } catch (error) {
    console.error("[Email] OTP delivery failed:", error.message || error);

    if (process.env.NODE_ENV !== "production") {
      console.log(`[Email:DEV] OTP for ${toEmail}: ${code}`);
      return { delivered: false, error };
    }

    throw new Error(
      "Could not send verification email. Check email provider configuration.",
    );
  }
}

module.exports = { sendOtpEmail };

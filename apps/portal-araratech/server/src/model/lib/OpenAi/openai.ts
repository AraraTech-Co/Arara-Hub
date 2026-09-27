import { Configuration, OpenAIApi } from "openai";
const config = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(config);

export const text = async ({ prompt }) => {
  console.log("🤖 Creating the singularity, please wait...");

  const res = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
  });

  console.log("🤖 AI has responded");
  return res.data?.choices?.[0].message?.content?.replace(/^\n+/, "");
};

export const image = async ({ prompt, size, number = null }) => {
  console.log("🤖 Creating the singularity, please wait...");

  const res = await openai.createImage({
    prompt: prompt,
    size: size || "512x512",
    n: number || 1,
  });

  console.log("🤖 AI has responded");
  return res.data?.data;
};

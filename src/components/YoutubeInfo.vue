<template>
  <div class="max-w-3xl mx-auto p-6 space-y-6">
    <h1 class="text-3xl font-bold text-center">
      YouTube Q&A (Groq + DeepSeek)
    </h1>

    <!-- 1. Charger le transcript YouTube -->
    <div class="space-y-2">
      <input
        v-model="videoUrl"
        type="text"
        placeholder="Collez l'URL YouTube…"
        class="w-full p-2 border rounded"
      />
      <button
        @click="loadTranscript"
        :disabled="loadingTranscript || !videoUrl"
        class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
      >
        {{ loadingTranscript ? "Chargement..." : "Charger Transcript" }}
      </button>
    </div>

    <div
      v-if="transcript"
      class="p-4 bg-gray-50 border rounded whitespace-pre-wrap text-sm"
    >
      <strong>Transcript :</strong>
      <div class="mt-2">{{ transcript }}</div>
    </div>

    <!-- 2. Poser une question (texte ou audio) -->
    <div v-if="transcript" class="space-y-4">
      <h2 class="text-xl font-semibold">Posez votre question</h2>

      <!-- 2a. Saisie texte -->
      <textarea
        v-model="questionText"
        rows="3"
        placeholder="Écrivez votre question…"
        class="w-full p-2 border rounded resize-none"
      ></textarea>

      <!-- 2b. Ou enregistrement vocal -->
      <div class="flex items-center space-x-2">
        <button
          @click="toggleRecord"
          :class="
            recording
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-yellow-600 hover:bg-yellow-700'
          "
          class="px-4 py-2 text-white rounded"
        >
          {{ recording ? "Stop" : "Enregistrer question" }}
        </button>
        <span v-if="recording" class="text-red-500 animate-pulse"
          >Enregistrement…</span
        >
      </div>

      <button
        @click="askQuestion"
        :disabled="loadingAsk || (!questionText && !lastTranscribedQuestion)"
        class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        {{ loadingAsk ? "En cours…" : "Envoyer à DeepSeek" }}
      </button>
    </div>

    <!-- 3. Afficher la réponse (Markdown rendu HTML) -->
    <div v-if="llmResponse" class="space-y-4">
      <div class="p-4 bg-blue-50 border rounded">
        <p><strong>Réponse (DeepSeek) :</strong></p>
        <div
          class="mt-1 prose prose-sm max-w-none"
          v-html="renderedMarkdown"
        ></div>
        <button
          class="mt-4 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          @click="playTTS(cleanForTTS(llmResponse))"
        >
          🔊 Réécouter la réponse
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { marked } from "marked";

// ⚠️ Pour test/démo uniquement, ne JAMAIS exposer en prod !
const GROQ_API_KEY = import.meta.env.VITE_API_KEY_GROQ;
const DEEPSEEK_API_KEY = import.meta.env.VITE_API_KEY_DEEPSEEK;
const API = import.meta.env.VITE_API_BASE || "http://localhost:5000";

// États
const videoUrl = ref("");
const transcript = ref("");
const loadingTranscript = ref(false);

const questionText = ref("");
let lastTranscribedQuestion = "";
const recording = ref(false);
const loadingAsk = ref(false);

const llmResponse = ref("");

let mediaRecorder: MediaRecorder;
let audioChunks: BlobPart[] = [];

// Markdown rendu HTML pour l'affichage
const renderedMarkdown = computed(() => marked.parse(llmResponse.value || ""));

// 1. Charger transcript YouTube (API maison)
async function loadTranscript() {
  loadingTranscript.value = true;
  transcript.value = "";
  try {
    const res = await fetch(`${API}/youtube/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: videoUrl.value }),
    });
    const data = await res.json();
    transcript.value = data.transcript || "";
  } catch (e: any) {
    alert("Erreur chargement transcript : " + e.message);
  } finally {
    loadingTranscript.value = false;
  }
}

// 2a. Toggle enregistrement vocal de la question
function toggleRecord() {
  if (recording.value) {
    mediaRecorder.stop();
    recording.value = false;
  } else {
    startRecording();
  }
}

async function startRecording() {
  lastTranscribedQuestion = "";
  questionText.value = "";
  audioChunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
  mediaRecorder.onstop = handleStop;
  mediaRecorder.start();
  recording.value = true;
}

async function handleStop() {
  const blob = new Blob(audioChunks, { type: "audio/webm" });
  try {
    questionText.value = "Transcription en cours…";
    const transcription = await transcribeWithGroq(blob);
    lastTranscribedQuestion = transcription || "";
    questionText.value = lastTranscribedQuestion;
  } catch (e: any) {
    alert("Erreur transcription Groq : " + e.message);
    questionText.value = "";
  }
}

// Transcription audio avec Groq Whisper
async function transcribeWithGroq(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, "audio.webm");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("temperature", "0");
  formData.append("response_format", "verbose_json");
  // formData.append("language", "fr"); // Décommente si tu veux forcer le français

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("Erreur Groq: " + response.statusText + " - " + errorText);
  }
  const data = await response.json();
  return data.text;
}

// Nettoie la réponse pour le TTS
function cleanForTTS(text: string) {
  let cleaned = text.replace(/^#+\s?/gm, "");
  cleaned = cleaned.replace(/^\s*[-*]\s+/gm, "");
  cleaned = cleaned.replace(/[*_`~]/g, "");
  cleaned = cleaned.replace(/^Réponse.*?:\s*/i, "");
  cleaned = cleaned.replace(/\([^)]+\)/g, "");
  cleaned = cleaned.replace(/^\d+\.\s+/gm, "");
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  return cleaned.trim();
}

// Synthèse vocale
async function playTTS(text: string) {
  try {
    const res = await fetch(
      "https://chatbot-20102024-8c94bbb4eddf.herokuapp.com/synthesize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          voice: "fr-FR-DeniseNeural",
        }),
      }
    );
    if (!res.ok) throw new Error("Erreur TTS");
    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();
  } catch (e) {
    alert("Erreur TTS : " + e.message);
  }
}

// 2b. Poser la question à DeepSeek
async function askQuestion() {
  loadingAsk.value = true;
  llmResponse.value = "";
  try {
    const prompt = `${transcript.value}\n\nQuestion: ${questionText.value}`;
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });
    const data = await res.json();
    llmResponse.value =
      data.choices?.[0]?.message?.content || "Aucune réponse.";
    if (llmResponse.value) {
      playTTS(cleanForTTS(llmResponse.value));
    }
  } catch (e: any) {
    alert("Erreur DeepSeek : " + e.message);
  } finally {
    loadingAsk.value = false;
  }
}
</script>

<style scoped>
.prose {
  /* Pour un rendu markdown plus joli, tu peux ajouter des styles ici */
  max-width: 100%;
}
</style>

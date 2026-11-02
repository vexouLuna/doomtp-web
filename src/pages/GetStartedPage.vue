<script setup lang="ts">
// How a streamer gets the bot into their chat: connect the channel, optionally mod the bot, then try a command.
// The tiers sit beside the steps, since each step is what moves a channel up one.
import { VxButton } from '@vex/ui'
import { computed, ref } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import Cmd from '@/components/Cmd.vue'
import DtpShell from '@/components/DtpShell.vue'
import { CONNECT_URL } from '@/lib/session'
import { BOT_CHANNEL, defaultSign } from '@/lib/site'

const p = computed(defaultSign)
const MOD = `/mod ${BOT_CHANNEL}`

const copied = ref<string | null>(null)
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
    setTimeout(() => (copied.value = null), 1500)
  } catch {
    // no clipboard access: the text is on the page to select by hand
  }
}
</script>

<template>
  <DtpShell>
    <article class="doc vx-wrap-code start">
      <h1 class="vx-display">Get started</h1>
      <p class="vx-muted">Connecting your channel puts the bot in your chat. Making it a moderator is optional, and then it is ready.</p>

      <div class="layout">
        <ol class="steps">
          <li>
            <h2 class="vx-display">Connect your channel</h2>
            <p>
              Sign in to Twitch as your channel. Twitch asks what the bot may use: channel points, subs, cheers, raids
              and your stream's title. Grant at least one and leave out what you like: what you grant is what turns on,
              and the bot joins your chat as soon as you are back.
            </p>
            <VxButton :href="CONNECT_URL" variant="primary">Connect with Twitch</VxButton>
            <p class="vx-muted small">
              You can take it back any time from <em>Connections</em> in your Twitch settings, or with
              <Cmd t="part" :sign="p" /> in your chat.
            </p>
          </li>
          <li>
            <h2 class="vx-display">Make the bot a moderator <span class="opt">optional</span></h2>
            <p>Type this in your own chat:</p>
            <div class="copyline">
              <pre class="vx-code">{{ MOD }}</pre>
              <VxButton size="sm" @click="copy(MOD)">{{ copied === MOD ? 'Copied' : 'Copy' }}</VxButton>
            </div>
            <p>
              That adds follow events and the moderation commands, lifts slow mode for the bot and raises how much it may
              send.
            </p>
          </li>
          <li>
            <h2 class="vx-display">Say hello</h2>
            <p>Commands start with the sign <code>{{ p }}</code>. Try these in your chat:</p>
            <ChatLine :lines="[`${p}ping`, `${p}help`]" :sign="p" block />
            <div class="copyline">
              <p class="vx-muted small">
                The sign is an emoji: copy it from here, or change it to something you can type, such as
                <code>!</code>, with <Cmd t="prefix !" :sign="p" />.
              </p>
              <VxButton size="sm" @click="copy(p)">{{ copied === p ? 'Copied' : `Copy ${p}` }}</VxButton>
            </div>
          </li>
        </ol>

        <aside class="tiers vx-panel">
          <h2 class="vx-display">What each tier adds</h2>
          <p class="vx-muted small">A channel's tier is the highest one it has reached; it shows next to its name.</p>
          <dl>
            <dt>basic</dt>
            <dd><span class="how">In your chat without connecting: added from Manage after signing in here, or by a bot admin.</span> Reads chat and replies: commands, custom commands, timers, quotes, stream on and off.</dd>
            <dt>moderator</dt>
            <dd><span class="how">The bot is a moderator.</span> Follow events, moderation detail and commands, higher send limits, no slow mode.</dd>
            <dt>full</dt>
            <dd><span class="how">Connected, with at least one thing granted.</span> Channel point redemptions, sub and cheer events, raids, the stream's title, the chat bot badge.</dd>
          </dl>
          <p class="vx-muted small">
            The bot checks its tier when it joins and every hour. More in
            <RouterLink to="/docs/features#channels">Features</RouterLink>.
          </p>
        </aside>
      </div>
    </article>
  </DtpShell>
</template>

<style scoped>
.start { max-width: none; }
.start > p { max-width: 52rem; }
.layout { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 28px; align-items: start; }
.steps { list-style: none; counter-reset: step; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 22px; }
.steps > li { counter-increment: step; position: relative; padding-left: 44px; margin: 0; }
.steps > li::before {
  content: counter(step);
  position: absolute; left: 0; top: 0; width: 30px; height: 30px; border-radius: 50%;
  display: grid; place-items: center; font-family: var(--vx-font-mono); font-weight: 600;
  color: var(--vx-accent); border: 1px solid var(--vx-accent);
}
.steps h2.vx-display { font-size: 20px; margin: 2px 0 8px; }
.opt { font-family: var(--vx-font-mono); font-size: 11px; text-transform: uppercase; color: var(--vx-muted); margin-left: 6px; }
.steps .vx-btn { margin: 0 0 10px; }
.copyline { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; }
.copyline .vx-code, .copyline p { flex: 1 1 auto; margin: 0; min-width: 0; }
.copyline .vx-btn { margin: 0; flex: none; }
.tiers { padding: 16px; }
.tiers h2.vx-display { font-size: 18px; margin: 0 0 6px; }
.tiers dl { margin: 12px 0; }
.tiers dt { font-family: var(--vx-font-mono); font-weight: 600; color: var(--vx-accent); margin-top: 10px; }
.tiers dd { margin: 2px 0 0; }
.how { display: block; color: var(--vx-ink); }
.small { font-size: 13px; }
@container vx-site (max-width: 760px) {
  .layout { grid-template-columns: 1fr; }
}
</style>

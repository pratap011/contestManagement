<script setup lang="ts">
import { computed } from 'vue'
import type { FlightRole } from '@/modules/flights/types'
import type {
  ManualFlightErrors,
  ManualFlightFormValues,
} from '@/modules/flights/validation'

const props = defineProps<{
  modelValue: ManualFlightFormValues
  errors: ManualFlightErrors
  role: FlightRole
  timeZone: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ManualFlightFormValues]
  submit: [value: ManualFlightFormValues]
}>()

type FieldKey = keyof ManualFlightFormValues

function setValue(key: FieldKey, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  emit('update:modelValue', { ...props.modelValue, [key]: target.value })
}

const datePart = () => props.modelValue.localDateTime.split('T')[0] ?? ''
const timePart = () => (props.modelValue.localDateTime.split('T')[1] ?? '').slice(0, 5)
const hourPart = () => timePart().slice(0, 2) || '09'
const minutePart = () => timePart().slice(3, 5) || '00'
const timeNoun = (role: FlightRole) => (role === 'arrival' ? 'arrival' : 'departure')
const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const minutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))
const minuteOptions = computed(() => {
  const values = new Set(minutes)
  const current = minutePart()
  if (current) values.add(current)
  return [...values].sort()
})

function setDate(event: Event) {
  const date = (event.target as HTMLInputElement).value
  emit('update:modelValue', {
    ...props.modelValue,
    localDateTime: date ? `${date}T${hourPart()}:${minutePart()}` : '',
  })
}

function setHour(event: Event) {
  const hour = (event.target as HTMLSelectElement).value
  const date = datePart()
  emit('update:modelValue', {
    ...props.modelValue,
    localDateTime: date && hour ? `${date}T${hour}:${minutePart()}` : '',
  })
}

function setMinute(event: Event) {
  const minute = (event.target as HTMLSelectElement).value
  const date = datePart()
  emit('update:modelValue', {
    ...props.modelValue,
    localDateTime: date && minute ? `${date}T${hourPart()}:${minute}` : '',
  })
}
</script>

<template>
  <form class="manual-form" novalidate @submit.prevent="emit('submit', { ...modelValue })">
    <p class="small muted">
      Airport-local times are interpreted in <strong>{{ timeZone }}</strong>. No PNR, passport, or
      date-of-birth data is requested.
    </p>
    <div class="form-grid">
      <div class="field">
        <label :for="`${role}-flight-number`">Flight number</label>
        <input
          :id="`${role}-flight-number`"
          class="input"
          :value="modelValue.flightNumber"
          placeholder="6E 2134"
          autocomplete="off"
          autocapitalize="characters"
          :aria-invalid="Boolean(errors.flightNumber)"
          :aria-describedby="errors.flightNumber ? `${role}-flight-number-error` : undefined"
          @input="setValue('flightNumber', $event)"
        />
        <span v-if="errors.flightNumber" :id="`${role}-flight-number-error`" class="field-error">
          {{ errors.flightNumber }}
        </span>
      </div>

      <div class="field">
        <label :for="`${role}-airline`">Airline <span class="muted">(optional)</span></label>
        <input
          :id="`${role}-airline`"
          class="input"
          :value="modelValue.airline"
          placeholder="IndiGo"
          autocomplete="organization"
          @input="setValue('airline', $event)"
        />
      </div>

      <div class="field">
        <label :for="`${role}-origin`">
          {{ role === 'arrival' ? 'From airport' : 'Origin airport' }}
        </label>
        <input
          :id="`${role}-origin`"
          class="input"
          :value="modelValue.origin"
          placeholder="DEL"
          maxlength="3"
          autocapitalize="characters"
          :aria-invalid="Boolean(errors.origin)"
          :aria-describedby="errors.origin ? `${role}-origin-error` : undefined"
          @input="setValue('origin', $event)"
        />
        <span v-if="errors.origin" :id="`${role}-origin-error`" class="field-error">{{ errors.origin }}</span>
      </div>

      <div class="field">
        <label :for="`${role}-destination`">
          {{ role === 'arrival' ? 'To airport' : 'Destination airport' }}
        </label>
        <input
          :id="`${role}-destination`"
          class="input"
          :value="modelValue.destination"
          placeholder="BLR"
          maxlength="3"
          autocapitalize="characters"
          :aria-invalid="Boolean(errors.destination)"
          :aria-describedby="errors.destination ? `${role}-destination-error` : undefined"
          @input="setValue('destination', $event)"
        />
        <span v-if="errors.destination" :id="`${role}-destination-error`" class="field-error">
          {{ errors.destination }}
        </span>
      </div>

      <div class="field">
        <label :for="`${role}-terminal`">Terminal <span class="muted">(optional)</span></label>
        <select
          :id="`${role}-terminal`"
          class="select"
          :value="modelValue.terminal"
          @change="setValue('terminal', $event)"
        >
          <option value="">Not sure / not supplied</option>
          <option value="T1">Terminal 1</option>
          <option value="T2">Terminal 2</option>
        </select>
        <span class="field-hint">A gate cannot be inferred from the terminal.</span>
      </div>

      <div class="field">
        <label :for="`${role}-gate`">Gate <span class="muted">(optional)</span></label>
        <input
          :id="`${role}-gate`"
          class="input"
          :value="modelValue.gate"
          placeholder="A3"
          autocomplete="off"
          autocapitalize="characters"
          @input="setValue('gate', $event)"
        />
      </div>

      <div class="field">
        <label :for="`${role}-date`">Scheduled {{ timeNoun(role) }} date</label>
        <input
          :id="`${role}-date`"
          class="input"
          type="date"
          :value="datePart()"
          :aria-invalid="Boolean(errors.localDateTime)"
          :aria-describedby="errors.localDateTime ? `${role}-time-error` : undefined"
          @input="setDate"
        />
      </div>

      <div class="field">
        <span class="label" :id="`${role}-time-label`">Scheduled {{ timeNoun(role) }} time</span>
        <div class="time-row" role="group" :aria-labelledby="`${role}-time-label`">
          <select
            :id="`${role}-hour`"
            class="select"
            :value="hourPart()"
            aria-label="Hour (24-hour clock)"
            :aria-invalid="Boolean(errors.localDateTime)"
            :aria-describedby="errors.localDateTime ? `${role}-time-error` : undefined"
            @change="setHour"
          >
            <option v-for="hour in hours" :key="`hour-${hour}`" :value="hour">{{ hour }}</option>
          </select>
          <span class="time-separator" aria-hidden="true">:</span>
          <select
            :id="`${role}-minute`"
            class="select"
            :value="minutePart()"
            aria-label="Minute"
            :aria-invalid="Boolean(errors.localDateTime)"
            :aria-describedby="errors.localDateTime ? `${role}-time-error` : undefined"
            @change="setMinute"
          >
            <option v-for="minute in minuteOptions" :key="`minute-${minute}`" :value="minute">{{ minute }}</option>
          </select>
        </div>
        <span class="field-hint">24-hour airport local time · {{ timeZone }}</span>
        <span v-if="errors.localDateTime" :id="`${role}-time-error`" class="field-error">
          {{ errors.localDateTime }}
        </span>
      </div>
    </div>

    <div class="btn-row" style="margin-top: 1rem">
      <button type="submit" class="btn secondary">Use these details</button>
      <span class="tiny muted">These details stay in this browser after you confirm the journey.</span>
    </div>
  </form>
</template>

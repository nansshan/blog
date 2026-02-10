import { proxy } from 'valtio'

import { type GuestbookDto } from '~/db/dto/guestbook.dto'

export const guestbookState = proxy<{
  messages: GuestbookDto[]
  replyingTo: GuestbookDto | null
}>({
  messages: [],
  replyingTo: null,
})

export function setMessages(messages: GuestbookDto[]) {
  guestbookState.messages = messages
}

export function signBook(message: GuestbookDto) {
  guestbookState.messages.push(message)
}

export function setReplyingTo(message: GuestbookDto | null) {
  guestbookState.replyingTo = message
}

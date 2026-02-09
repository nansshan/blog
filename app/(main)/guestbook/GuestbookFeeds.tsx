'use client'

import 'dayjs/locale/zh-cn'

import { SignedIn } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'
import { clsxm } from '@zolplay/utils'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import Image from 'next/image'
import React from 'react'
import { useSnapshot } from 'valtio'

import { UTurnLeftIcon } from '~/assets'
import { CommentMarkdown } from '~/components/CommentMarkdown'
import { ElegantTooltip } from '~/components/ui/Tooltip'
import { type GuestbookDto } from '~/db/dto/guestbook.dto'
import { parseDisplayName } from '~/lib/string'

import { guestbookState, setMessages, setReplyingTo } from './guestbook.state'

dayjs.extend(relativeTime)

function Message({
  message,
  idx,
  length,
  onReply,
}: {
  message: GuestbookDto
  idx: number
  length: number
  onReply: (message: GuestbookDto) => void
}) {
  const [highlighted, setHighlighted] = React.useState(false)

  return (
    <li id={message.id} className="group/message relative pb-8">
      {idx !== length - 1 && (
        <span
          className="absolute left-5 top-16 -ml-px h-[calc(100%-4.5rem)] w-0.5 rounded bg-zinc-200 dark:bg-zinc-800"
          aria-hidden="true"
        />
      )}
      <div
        className={clsxm(
          '-mx-2 rounded-xl px-2 py-2 transition-colors duration-500',
          highlighted && 'bg-lime-50/60 dark:bg-lime-900/10'
        )}
      >
        <div className="relative flex items-start space-x-3">
          <Image
            src={
              message.userInfo?.imageUrl ??
              `/avatars/avatar_${(idx % 8) + 1}.png`
            }
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 flex-shrink-0 rounded-full bg-zinc-200 ring-2 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-800"
            unoptimized
          />
          <div className="-mt-1 flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
            <b className="text-sm font-bold dark:text-zinc-100">
              {parseDisplayName(message.userInfo || {})}
            </b>
            {message.parentId && message.parentUserInfo && (
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById(message.parentId)
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    el.dispatchEvent(new CustomEvent('guestbook:highlight'))
                  }
                }}
                className="flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                <UTurnLeftIcon className="h-3 w-3" />
                回复了 {parseDisplayName(message.parentUserInfo)}
              </button>
            )}
            <time
              dateTime={message.createdAt.toString()}
              className="inline-flex select-none text-[12px] font-medium opacity-40"
            >
              {dayjs(message.createdAt).locale('zh-cn').fromNow()}
            </time>
            <SignedIn>
              <ElegantTooltip content="回复">
                <button
                  type="button"
                  onClick={() => onReply(message)}
                  className="ml-auto opacity-0 transition-opacity group-hover/message:opacity-100"
                >
                  <UTurnLeftIcon className="h-3.5 w-3.5 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300" />
                </button>
              </ElegantTooltip>
            </SignedIn>
          </div>
        </div>
        <div className="comment__message -mt-4 mb-1 pl-[3.25rem] text-sm">
          <CommentMarkdown>{message.message}</CommentMarkdown>
        </div>
      </div>
      <HighlightListener
        id={message.id}
        onHighlight={() => {
          setHighlighted(true)
          setTimeout(() => setHighlighted(false), 1500)
        }}
      />
    </li>
  )
}

// Listen for highlight events on this message element
function HighlightListener({
  id,
  onHighlight,
}: {
  id: string
  onHighlight: () => void
}) {
  React.useEffect(() => {
    const el = document.getElementById(id)
    if (!el) return

    const handler = () => onHighlight()
    el.addEventListener('guestbook:highlight', handler)
    return () => el.removeEventListener('guestbook:highlight', handler)
  }, [id, onHighlight])

  return null
}

const MessageBlock = React.memo(Message)

export function GuestbookFeeds(props: { messages?: GuestbookDto[] }) {
  const { data: feed } = useQuery({
    queryKey: ['guestbook'],
    queryFn: async () => {
      const res = await fetch('/api/guestbook')
      const data = await res.json()
      return data as GuestbookDto[]
    },
    refetchInterval: 30000,
    initialData: props.messages ?? [],
  })
  const { messages } = useSnapshot(guestbookState)
  React.useEffect(() => {
    setMessages(feed ?? [])
  }, [feed])

  const handleReply = React.useCallback((message: GuestbookDto) => {
    setReplyingTo(message)
  }, [])

  return (
    <div className="relative mt-12">
      <div className="absolute inset-0 flex items-center" aria-hidden="true" />

      <ul role="list" className="-mb-8 px-1 md:px-4">
        {messages.map((message, idx) => (
          <MessageBlock
            key={message.id}
            message={message as GuestbookDto}
            idx={idx}
            length={messages.length}
            onReply={handleReply}
          />
        ))}
      </ul>
    </div>
  )
}

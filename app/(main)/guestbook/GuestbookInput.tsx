'use client'

import { useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from '@tanstack/react-query'
import { clsxm } from '@zolplay/utils'
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
} from 'framer-motion'
import Image from 'next/image'
import React from 'react'
import { useReward } from 'react-rewards'
import TextareaAutosize from 'react-textarea-autosize'
import { useSnapshot } from 'valtio'

import {
  guestbookState,
  setReplyingTo,
  signBook,
} from '~/app/(main)/guestbook/guestbook.state'
import {
  EyeCloseIcon,
  EyeOpenIcon,
  TiltedSendIcon,
  UTurnLeftIcon,
  XSquareIcon,
} from '~/assets'
import { CommentMarkdown } from '~/components/CommentMarkdown'
import { RichLink } from '~/components/links/RichLink'
import { LoadingSpinner } from '~/components/LoadingSpinner'
import { ElegantTooltip } from '~/components/ui/Tooltip'
import { type GuestbookDto } from '~/db/dto/guestbook.dto'
import { parseDisplayName } from '~/lib/string'

const MAX_MESSAGE_LENGTH = 600
const REWARDS_ID = 'guestbook-rewards'

interface User {
  id: string
  name: string
  email: string | null
  imageUrl: string | null
}

export function GuestbookInput() {
  const { user } = useUser()
  const { replyingTo } = useSnapshot(guestbookState)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const userListRef = React.useRef<HTMLDivElement>(null)
  const [message, setMessage] = React.useState('')
  const [isPreviewing, setIsPreviewing] = React.useState(false)
  const [showUserList, setShowUserList] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [cursorPosition, setCursorPosition] = React.useState(0)
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  const { reward } = useReward(REWARDS_ID, 'emoji', {
    position: 'absolute',
    emoji: [
      '🤓',
      '😊',
      '🥳',
      '🤩',
      '🤪',
      '🤯',
      '🥰',
      '😎',
      '🤗',
      '😇',
      '🥸',
      '🤠',
      '💯',
      '🤔',
      '🤫',
      '🤭',
      '🙏',
      '👀',
      '👨🏻‍💻',
    ],
    elementCount: 62,
  })

  // 预加载用户列表，避免首次输入 @ 时的延迟
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['guestbook-users'],
    queryFn: async () => {
      const res = await fetch('/api/guestbook/users')
      if (!res.ok) throw new Error('Failed to fetch users')
      return res.json()
    },
    // 始终启用，页面加载时就获取数据
    enabled: true,
    staleTime: 300000, // 5分钟缓存
    gcTime: 600000, // 10分钟缓存保留时间
  })

  const { mutate: signGuestbook, isPending: isLoading } = useMutation({
    mutationKey: ['guestbook'],
    mutationFn: async () => {
      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          parentId: replyingTo?.id ?? null,
        }),
      })
      const data: GuestbookDto = await res.json()
      return data
    },
    onSuccess: (data) => {
      setMessage('')
      setIsPreviewing(false)
      setReplyingTo(null)
      reward()
      signBook(data)
    },
  })

  const onClickSend = () => {
    if (isLoading) {
      return
    }

    signGuestbook()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showUserList && filteredUsers.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => 
            prev < filteredUsers.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => 
            prev > 0 ? prev - 1 : filteredUsers.length - 1
          )
          break
        case 'Enter':
          e.preventDefault()
          if (filteredUsers[selectedIndex]) {
            handleSelectUser(filteredUsers[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          setShowUserList(false)
          break
      }
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault()
      onClickSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const newCursorPosition = e.target.selectionStart
    
    setMessage(newValue)
    setCursorPosition(newCursorPosition)
    
    // 检查光标前的字符是否是 @
    const textBeforeCursor = newValue.slice(0, newCursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1 && lastAtIndex === newCursorPosition - 1) {
      setShowUserList(true)
      setSearchQuery('')
      setSelectedIndex(0)
    } else if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
      const hasSpace = textAfterAt.includes(' ')
      
      if (!hasSpace) {
        setSearchQuery(textAfterAt)
        setShowUserList(true)
        setSelectedIndex(0)
      } else {
        setShowUserList(false)
      }
    } else {
      setShowUserList(false)
    }
  }

  const handleSelectUser = (selectedUser: User) => {
    const textBeforeCursor = message.slice(0, cursorPosition)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1) {
      const textBeforeAt = message.slice(0, lastAtIndex)
      const textAfterCursor = message.slice(cursorPosition)
      const newMessage = `${textBeforeAt}@${selectedUser.name} ${textAfterCursor}`
      
      setMessage(newMessage)
      setShowUserList(false)
      
      // 设置光标位置到用户名后
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = lastAtIndex + selectedUser.name.length + 2
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
          textareaRef.current.focus()
        }
      }, 0)
    }
  }

  const filteredUsers = React.useMemo(() => {
    if (!searchQuery) return users
    
    const query = searchQuery.toLowerCase()
    return users.filter(u => 
      u.name.toLowerCase().includes(query)
    )
  }, [users, searchQuery])

  // Auto-focus and scroll when entering reply mode
  React.useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [replyingTo])

  // 确保选中的项目在可视区域内
  React.useEffect(() => {
    if (userListRef.current && showUserList) {
      const container = userListRef.current
      const selectedButton = container.children[selectedIndex] as HTMLElement
      if (selectedButton) {
        const containerHeight = container.offsetHeight
        const buttonTop = selectedButton.offsetTop
        const buttonHeight = selectedButton.offsetHeight
        
        if (buttonTop < container.scrollTop) {
          container.scrollTop = buttonTop
        } else if (buttonTop + buttonHeight > container.scrollTop + containerHeight) {
          container.scrollTop = buttonTop + buttonHeight - containerHeight
        }
      }
    }
  }, [selectedIndex, showUserList])

  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const handleMouseMove = React.useCallback(
    ({ clientX, clientY, currentTarget }: React.MouseEvent) => {
      const bounds = currentTarget.getBoundingClientRect()
      mouseX.set(clientX - bounds.left)
      mouseY.set(clientY - bounds.top)
    },
    [mouseX, mouseY]
  )
  const background = useMotionTemplate`radial-gradient(320px circle at ${mouseX}px ${mouseY}px, var(--spotlight-color) 0%, transparent 85%)`

  if (!user) {
    return (
      <div className="h-[82px] animate-pulse rounded-xl bg-white/70 ring-2 ring-zinc-200/30 dark:bg-zinc-800/80 dark:ring-zinc-700/30" />
    )
  }

  return (
    <div
      className={clsxm(
        'group relative flex w-full rounded-xl bg-gradient-to-b from-zinc-50/50 to-white/70 p-2 pb-6 shadow-xl shadow-zinc-500/10 ring-2 ring-zinc-200/30 transition-opacity [--spotlight-color:rgb(236_252_203_/_0.25)] dark:from-zinc-900/70 dark:to-zinc-800/60 dark:shadow-zinc-700/10 dark:ring-zinc-700/30 dark:[--spotlight-color:rgb(217_249_157_/_0.04)] md:p-4',
        isLoading && 'pointer-events-none opacity-50'
      )}
      onMouseMove={handleMouseMove}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px z-0 rounded-xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background }}
        aria-hidden="true"
      />
      <div
        className={clsxm(
          'pointer-events-none absolute inset-0 z-0 select-none overflow-hidden rounded-xl mix-blend-overlay',
          isLoading && 'opacity-0'
        )}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-[-18deg] fill-black/5 stroke-zinc-900/10 dark:fill-[hsla(0,0%,100%,.03)] dark:stroke-white/10"
        >
          <defs>
            <pattern
              id=":R1d6hd6:"
              width="72"
              height="56"
              patternUnits="userSpaceOnUse"
              x="50%"
              y="16"
            >
              <path d="M.5 56V.5H72" fill="none"></path>
            </pattern>
          </defs>
          <rect
            width="100%"
            height="100%"
            strokeWidth="0"
            fill="url(#:R1d6hd6:)"
          ></rect>
          <svg x="50%" y="16" className="overflow-visible">
            <rect strokeWidth="0" width="73" height="57" x="0" y="56"></rect>
            <rect strokeWidth="0" width="73" height="57" x="72" y="168"></rect>
          </svg>
        </svg>
      </div>

      <div className="z-10 h-8 w-8 shrink-0 md:h-10 md:w-10">
        <Image
          src={user.imageUrl}
          alt=""
          width={40}
          height={40}
          className="h-8 w-8 select-none rounded-full md:h-10 md:w-10"
          unoptimized
        />
      </div>

      <div className="z-10 ml-2 flex-1 shrink-0 md:ml-4">
        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            >
              <UTurnLeftIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                回复{' '}
                <b>
                  {parseDisplayName(
                    replyingTo.userInfo || {}
                  )}
                </b>
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="ml-auto shrink-0 rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              >
                <XSquareIcon className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="relative">
          {isPreviewing ? (
            <div
              className="comment__message flex-1 shrink-0 px-2 py-1 text-sm text-zinc-800 dark:text-zinc-200"
              key="preview"
            >
              <CommentMarkdown>{message}</CommentMarkdown>
            </div>
          ) : (
            <TextareaAutosize
              ref={textareaRef}
              className="block w-full shrink-0 resize-none border-0 bg-transparent p-0 text-sm leading-6 text-zinc-800 placeholder-zinc-400 outline-none transition-[height] will-change-[height] focus:outline-none focus:ring-0 dark:text-zinc-200 dark:placeholder-zinc-500"
              value={message}
              onChange={handleInputChange}
              placeholder={
                isLoading
                  ? '正在发送中...'
                  : replyingTo
                    ? `回复 ${parseDisplayName(replyingTo.userInfo || {})}...`
                    : '说点什么吧，万一火不了呢...'
              }
              onKeyDown={handleKeyDown}
              maxRows={8}
              autoFocus
              disabled={isLoading}
            />
          )}
          
          {/* 用户列表 */}
          <AnimatePresence>
            {showUserList && filteredUsers.length > 0 && (
              <motion.div
                ref={userListRef}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute left-0 top-full z-50 mt-1 max-h-48 w-64 overflow-y-auto rounded-lg bg-white shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700"
              >
                {filteredUsers.map((u, index) => (
                  <button
                    key={u.id}
                    className={clsxm(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                      'hover:bg-zinc-50 dark:hover:bg-zinc-700/50',
                      index === selectedIndex && 'bg-zinc-100 dark:bg-zinc-700/70'
                    )}
                    onClick={() => handleSelectUser(u)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {u.imageUrl && (
                      <Image
                        src={u.imageUrl}
                        alt=""
                        width={24}
                        height={24}
                        className="h-6 w-6 rounded-full"
                        unoptimized
                      />
                    )}
                    <span className="text-zinc-800 dark:text-zinc-200">
                      {u.name}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer className="-mb-1.5 mt-3 flex h-5 w-full items-center justify-between">
          <span
            className={clsxm(
              'flex-1 shrink-0 select-none text-[10px] text-zinc-500 transition-opacity',
              message.length > 0 ? 'opacity-100' : 'opacity-0'
            )}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                正在发送留言...
              </span>
            ) : (
              <>
                支持 <b>Markdown</b> 与{' '}
                <RichLink
                  favicon={false}
                  href="https://docs.github.com/zh/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax"
                  className="font-bold hover:underline"
                >
                  GFM
                </RichLink>
                {' · 输入 @ 提及用户'}
              </>
            )}
          </span>
          <AnimatePresence>
            {message.length > 0 && (
              <motion.aside
                key="send-button-wrapper"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 8 }}
                className="flex select-none items-center gap-2.5"
              >
                <span
                  className={clsxm(
                    'font-mono text-[10px]',
                    message.length > MAX_MESSAGE_LENGTH
                      ? 'text-red-500'
                      : 'text-zinc-500'
                  )}
                >
                  {message.length}/{MAX_MESSAGE_LENGTH}
                </span>

                <ElegantTooltip
                  content={isPreviewing ? '关闭预览' : '预览一下'}
                >
                  <motion.button
                    className="appearance-none"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    disabled={isLoading}
                    onClick={() => setIsPreviewing((prev) => !prev)}
                  >
                    {isPreviewing ? (
                      <EyeCloseIcon className="h-5 w-5 text-zinc-800 dark:text-zinc-200" />
                    ) : (
                      <EyeOpenIcon className="h-5 w-5 text-zinc-800 dark:text-zinc-200" />
                    )}
                  </motion.button>
                </ElegantTooltip>

                <ElegantTooltip content={isLoading ? "正在发送..." : "发送"}>
                  <motion.button
                    className="appearance-none"
                    whileHover={{ scale: isLoading ? 1 : 1.05 }}
                    whileTap={{ scale: isLoading ? 1 : 0.95 }}
                    type="button"
                    disabled={isLoading}
                    onClick={onClickSend}
                  >
                    {isLoading ? (
                      <LoadingSpinner className="text-zinc-800 dark:text-zinc-200" />
                    ) : (
                      <TiltedSendIcon className="h-5 w-5 text-zinc-800 dark:text-zinc-200" />
                    )}
                  </motion.button>
                </ElegantTooltip>
              </motion.aside>
            )}
          </AnimatePresence>
          <div
            className="pointer-events-none absolute bottom-0 right-0 w-1/2 select-none"
            id={REWARDS_ID}
          />
        </footer>
      </div>
    </div>
  )
}
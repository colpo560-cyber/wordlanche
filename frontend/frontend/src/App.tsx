import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useBalance,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useChainId,
} from 'wagmi'
import { formatEther, type Address } from 'viem'
import { WORDLE_ROYALE_ADDRESS, WORDLE_ROYALE_ABI, WORDLE_TOKEN_ADDRESS, WORDLE_TOKEN_ABI } from './abi'
import { avalancheFuji } from './wagmi'
import * as api from './api'
import { MobileWalletSelector } from './MobileWalletSelector'
import {
  isMobileDevice,
  getPreferredMobileWallet,
  openWalletDeepLink,
  savePreferredMobileWallet,
} from './walletDeepLinks'
import './App.css'

type LetterState = 'correct' | 'present' | 'absent' | 'empty' | 'active'

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
]

// Animated Mockup Game Component - Grid and Victory loop with fade transitions
function MockupGame() {
  const [gameScreen, setGameScreen] = useState<'playing' | 'victory'>('playing')
  const [opacity, setOpacity] = useState(1)
  const [mockupState, setMockupState] = useState({
    currentRow: 0,
    currentCol: 0,
    guesses: ['', '', '', '', '', ''],
    results: [
      ['empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty'],
    ] as LetterState[][],
    phase: 'typing' as 'typing' | 'revealing' | 'done'
  })

  // Demo sequence: CRISP -> BLAST -> PLANT (win!)
  // Target word: PLANT (P-L-A-N-T)
  const demoSequence = [
    { word: 'CRISP', results: ['absent', 'absent', 'absent', 'absent', 'present'] as LetterState[] }, // P is present (wrong position)
    { word: 'BLAST', results: ['absent', 'correct', 'correct', 'absent', 'correct'] as LetterState[] }, // L correct, A correct, T correct
    { word: 'PLANT', results: ['correct', 'correct', 'correct', 'correct', 'correct'] as LetterState[] },
  ]

  // Reset game state
  const resetGame = () => {
    setMockupState({
      currentRow: 0,
      currentCol: 0,
      guesses: ['', '', '', '', '', ''],
      results: [
        ['empty', 'empty', 'empty', 'empty', 'empty'],
        ['empty', 'empty', 'empty', 'empty', 'empty'],
        ['empty', 'empty', 'empty', 'empty', 'empty'],
        ['empty', 'empty', 'empty', 'empty', 'empty'],
        ['empty', 'empty', 'empty', 'empty', 'empty'],
        ['empty', 'empty', 'empty', 'empty', 'empty'],
      ],
      phase: 'typing'
    })
  }

  // Victory -> Playing transition with fade
  useEffect(() => {
    if (gameScreen === 'victory') {
      const timeout = setTimeout(() => {
        // Fade out
        setOpacity(0)
        setTimeout(() => {
          resetGame()
          setGameScreen('playing')
          // Fade in
          setTimeout(() => setOpacity(1), 50)
        }, 600)
      }, 3500)
      return () => clearTimeout(timeout)
    }
  }, [gameScreen])

  // Game animation
  useEffect(() => {
    if (gameScreen !== 'playing') return

    let timeout: ReturnType<typeof setTimeout>

    const runAnimation = () => {
      setMockupState(prev => {
        const { currentRow, currentCol, guesses, results, phase } = prev

        // If done with all guesses, transition to victory with fade
        if (phase === 'done') {
          timeout = setTimeout(() => {
            setOpacity(0)
            setTimeout(() => {
              setGameScreen('victory')
              setTimeout(() => setOpacity(1), 50)
            }, 400)
          }, 600)
          return prev
        }

        // If we've done all guesses, mark done
        if (currentRow >= demoSequence.length) {
          return { ...prev, phase: 'done' }
        }

        const currentWord = demoSequence[currentRow].word

        // Typing phase - faster
        if (phase === 'typing') {
          if (currentCol < 5) {
            const newGuesses = [...guesses]
            newGuesses[currentRow] = currentWord.slice(0, currentCol + 1)
            timeout = setTimeout(runAnimation, 200)
            return { ...prev, guesses: newGuesses, currentCol: currentCol + 1 }
          } else {
            // Start revealing after a pause
            timeout = setTimeout(runAnimation, 400)
            return { ...prev, phase: 'revealing', currentCol: 0 }
          }
        }

        // Revealing phase - faster
        if (phase === 'revealing') {
          if (currentCol < 5) {
            const newResults = [...results.map(r => [...r])]
            newResults[currentRow][currentCol] = demoSequence[currentRow].results[currentCol]
            timeout = setTimeout(runAnimation, 250)
            return { ...prev, results: newResults, currentCol: currentCol + 1 }
          } else {
            // Move to next row after a pause
            timeout = setTimeout(runAnimation, 500)
            return { ...prev, currentRow: currentRow + 1, currentCol: 0, phase: 'typing' }
          }
        }

        return prev
      })
    }

    timeout = setTimeout(runAnimation, 500)
    return () => clearTimeout(timeout)
  }, [gameScreen, mockupState.phase, mockupState.currentRow, mockupState.currentCol])

  // Victory Screen
  if (gameScreen === 'victory') {
    return (
      <div className="mockup-victory" style={{ opacity, transition: 'opacity 0.6s ease-in-out' }}>
        <div className="mockup-victory-icon">🏆</div>
        <h3 className="mockup-victory-title">Victory!</h3>
        <p className="mockup-victory-word">The word was: <strong>PLANT</strong></p>
        <div className="mockup-reward">
          <span className="mockup-reward-amount">+100 <img src="/wrdl-token.svg" alt="WRDL" className="reward-token-icon" /></span>
        </div>
      </div>
    )
  }

  // Playing Screen
  return (
    <div className="mockup-playing" style={{ opacity, transition: 'opacity 0.6s ease-in-out' }}>
      <div className="mockup-grid-container">
        <div className="mockup-grid">
          {mockupState.guesses.map((guess, rowIndex) => (
            <div key={rowIndex} className="mockup-row">
              {[0, 1, 2, 3, 4].map((colIndex) => {
                const letter = guess[colIndex] || ''
                const state = mockupState.results[rowIndex][colIndex]
                return (
                  <div
                    key={colIndex}
                    className={`mockup-tile ${state} ${letter && state === 'empty' ? 'active' : ''}`}
                  >
                    {letter}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="mockup-legend">
          <div className="mockup-legend-row">
            <div className="legend-item">
              <span className="legend-tile correct">A</span>
              <span>Correct spot</span>
            </div>
            <div className="legend-item">
              <span className="legend-tile present">B</span>
              <span>Wrong spot</span>
            </div>
          </div>
          <div className="mockup-legend-row">
            <div className="legend-item">
              <span className="legend-tile absent">C</span>
              <span>Not in word</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const chainId = useChainId()
  const { data: balance } = useBalance({ address })

  // Game config state
  const [resolverAddress, setResolverAddress] = useState<Address | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [guessResults, setGuessResults] = useState<api.GuessResult[]>([])
  const [logs, setLogs] = useState<{ msg: string; type: string }[]>([])

  // Game state
  const [gamePhase, setGamePhase] = useState<'lobby' | 'playing' | 'finished'>('lobby')
  const [targetWord, setTargetWord] = useState('')
  const [guesses, setGuesses] = useState<string[]>([])
  const [currentGuess, setCurrentGuess] = useState('')
  const [gameWon, setGameWon] = useState(false)
  const [playingGameId, setPlayingGameId] = useState<bigint | null>(null)
  const [keyboardState, setKeyboardState] = useState<Record<string, LetterState>>({})
  const [shakeRow, setShakeRow] = useState(false)
  const [victoryRow, setVictoryRow] = useState<number | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)

  // Mobile wallet connection state
  const [showMobileWalletSelector, setShowMobileWalletSelector] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [pendingWcUri, setPendingWcUri] = useState<string | null>(null)

  // Multiplier tooltip state
  const [showMultiplierTooltip, setShowMultiplierTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const multiplierBoxRef = useRef<HTMLDivElement>(null)

  // Fetch resolver address from backend
  useEffect(() => {
    api.getResolver()
      .then(resolver => setResolverAddress(resolver as Address))
      .catch(err => {
        console.error('Failed to get resolver:', err)
      })
  }, [])

  // Contract reads - using resolver address directly
  const { data: currentGameId, refetch: refetchGameId } = useReadContract({
    address: WORDLE_ROYALE_ADDRESS,
    abi: WORDLE_ROYALE_ABI,
    functionName: 'getCurrentGameId',
    args: resolverAddress ? [resolverAddress] : undefined,
    query: { enabled: !!resolverAddress },
  })

  const { data: isResolved, refetch: refetchIsResolved } = useReadContract({
    address: WORDLE_ROYALE_ADDRESS,
    abi: WORDLE_ROYALE_ABI,
    functionName: 'isGameResolved',
    args: resolverAddress && playingGameId !== null ? [resolverAddress, playingGameId] : undefined,
    query: { enabled: !!resolverAddress && playingGameId !== null },
  })

  // Player stats
  const { data: playerStats, refetch: refetchStats } = useReadContract({
    address: WORDLE_ROYALE_ADDRESS,
    abi: WORDLE_ROYALE_ABI,
    functionName: 'getPlayerStats',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Streak multiplier
  const { data: streakMultiplier, refetch: refetchStreakMultiplier } = useReadContract({
    address: WORDLE_ROYALE_ADDRESS,
    abi: WORDLE_ROYALE_ABI,
    functionName: 'getStreakMultiplier',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Token balance
  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: WORDLE_TOKEN_ADDRESS,
    abi: WORDLE_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Prize pool
  const { data: prizePool } = useReadContract({
    address: WORDLE_ROYALE_ADDRESS,
    abi: WORDLE_ROYALE_ABI,
    functionName: 'getPrizePool',
    query: { enabled: isConnected },
  })

  // Weekly leaderboard
  const { data: leaderboardData } = useReadContract({
    address: WORDLE_ROYALE_ADDRESS,
    abi: WORDLE_ROYALE_ABI,
    functionName: 'getWeeklyLeaderboard',
    query: { enabled: isConnected },
  })

  // Contract writes
  const { writeContract: joinGame, data: joinTxHash, isPending: isJoining } = useWriteContract()
  const { isLoading: isJoinConfirming, isSuccess: isJoinConfirmed } = useWaitForTransactionReceipt({ hash: joinTxHash })

  const { writeContract: resolveGame, data: resolveTxHash, isPending: isResolving } = useWriteContract()
  const { isLoading: isResolveConfirming, isSuccess: isResolveConfirmed } = useWaitForTransactionReceipt({ hash: resolveTxHash })

  const addLog = useCallback((msg: string, type: string = '') => {
    setLogs((prev) => [{ msg: `${new Date().toLocaleTimeString()} - ${msg}`, type }, ...prev.slice(0, 19)])
  }, [])

  // Handle join confirmation
  useEffect(() => {
    if (isJoinConfirmed && currentGameId !== undefined && address && resolverAddress) {
      addLog('Game registered on-chain!', 'success')
      // The game ID we joined is the one before the current (since it increments after join)
      const gameWeJoined = currentGameId > 0n ? currentGameId - 1n : 0n
      setPlayingGameId(gameWeJoined)
      refetchGameId()

      // Start game session with backend
      api.startGame(address, gameWeJoined)
        .then((session) => {
          setSessionId(session.sessionId)
          setSessionToken(session.token)
          setGuesses([])
          setGuessResults([])
          setCurrentGuess('')
          setGameWon(false)
          setKeyboardState({})
          setGamePhase('playing')
          addLog(`Game started! Guess the ${session.wordLength}-letter word`, 'success')
        })
        .catch((err) => {
          addLog(`Failed to start game: ${err.message}`, 'error')
        })
    }
  }, [isJoinConfirmed, currentGameId, addLog, refetchGameId, address, resolverAddress])

  // Handle resolve confirmation
  useEffect(() => {
    if (isResolveConfirmed) {
      addLog('Game resolved! WRDL rewards sent!', 'success')
      setGamePhase('lobby')
      setPlayingGameId(null)
      refetchGameId()
      refetchStats()
      refetchTokenBalance()
      refetchIsResolved()
      refetchStreakMultiplier()
    }
  }, [isResolveConfirmed, addLog, refetchGameId, refetchStats, refetchTokenBalance, refetchIsResolved, refetchStreakMultiplier])

  
  const handleJoin = () => {
    if (!resolverAddress) return addLog('Resolver not loaded yet', 'error')
    addLog('Joining free game...')
    joinGame({
      address: WORDLE_ROYALE_ADDRESS,
      abi: WORDLE_ROYALE_ABI,
      functionName: 'join',
      args: [resolverAddress],
    })
  }

  // Handler for mobile wallet selection
  const handleMobileWalletSelect = (walletId: string) => {
    console.log('User selected wallet:', walletId)
    console.log('Pending WC URI available:', pendingWcUri ? 'YES' : 'NO')

    savePreferredMobileWallet(walletId)

    // If we have a pending WC URI, open the deep link immediately
    if (pendingWcUri) {
      console.log('Opening deep link with pending URI for wallet:', walletId)
      openWalletDeepLink(walletId, pendingWcUri)
      setPendingWcUri(null)
    } else {
      console.error('No pending WC URI available!')
    }
  }

  const handleConnect = async () => {
    if (isConnecting) return

    const isOnMobile = isMobileDevice()
    console.log(`📱 Device: ${isOnMobile ? 'Mobile' : 'Desktop'}`)
    console.log(`📋 Available connectors:`, connectors.map(c => ({ id: c.id, name: c.name, type: c.type })))

    if (isOnMobile) {
      // Mobile: Start WalletConnect first, then show modal or open preferred wallet
      const wcConnector = connectors.find(c => c.id === 'walletConnect' || c.type === 'walletConnect')
      console.log(`🔍 WalletConnect connector found:`, wcConnector ? { id: wcConnector.id, name: wcConnector.name, type: wcConnector.type } : 'NOT FOUND')

      if (!wcConnector) {
        console.error('❌ WalletConnect connector not found')
        alert('WalletConnect not available')
        return
      }

      setIsConnecting(true)
      try {
        // Get the provider to listen for URI
        console.log('🔄 Getting WalletConnect provider...')
        const wcProvider = await wcConnector.getProvider?.()
        console.log('📦 WalletConnect provider:', wcProvider ? 'OBTAINED' : 'NULL')

        if (!wcProvider) {
          console.error('❌ WalletConnect provider not available')
          alert('WalletConnect provider not available')
          setIsConnecting(false)
          return
        }

        // Check for preferred wallet
        const preferredWallet = getPreferredMobileWallet()
        console.log('💾 Preferred wallet:', preferredWallet ? preferredWallet.name : 'NONE')

        // Listen for display_uri event
        let uriCaptured = false
        const handleDisplayUri = (uri: string) => {
          console.log('🎯 handleDisplayUri CALLED!')
          if (uriCaptured) {
            console.log('⚠️ URI already captured, skipping')
            return
          }
          uriCaptured = true
          console.log('🔗 WalletConnect URI captured!')
          console.log('📏 URI length:', uri.length)
          console.log('📝 URI (first 100 chars):', uri.substring(0, 100) + '...')

          if (preferredWallet) {
            // User has a preferred wallet, open it directly
            console.log(`🚀 Opening preferred wallet: ${preferredWallet.name}`)
            const success = openWalletDeepLink(preferredWallet.id, uri)
            console.log(`✅ openWalletDeepLink returned:`, success)
          } else {
            // No preferred wallet, save URI and show selector
            console.log('📱 No preferred wallet, saving URI and showing selector')
            setPendingWcUri(uri)
            setShowMobileWalletSelector(true)
          }
        }

        // Listen for display_uri event
        console.log('👂 Setting up display_uri listener...')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const provider = wcProvider as any
        if (provider.on) {
          provider.on('display_uri', handleDisplayUri)
          console.log('✅ display_uri listener attached')
        } else {
          console.error('❌ Provider does not support .on() method')
        }

        // Start connection - this will trigger display_uri event
        console.log('🚀 Starting WalletConnect connection...')
        connect({ connector: wcConnector, chainId: avalancheFuji.id })
        console.log('✅ connect() called (not awaited)')

      } catch (error) {
        console.error('❌ Connection failed:', error)
        alert(`Connection error: ${error}`)
      } finally {
        // Don't set isConnecting to false here - the connection is still pending
        // setIsConnecting(false)
      }
    } else {
      // Desktop: use injected wallet, force Avalanche Fuji chain
      const injected = connectors.find((c) => c.id === 'injected')
      if (injected) {
        connect({ connector: injected, chainId: avalancheFuji.id })
      }
    }
  }

  // Reset isConnecting when connection succeeds or modal closes
  useEffect(() => {
    if (isConnected) {
      setIsConnecting(false)
      setShowMobileWalletSelector(false)
      setPendingWcUri(null)
    }
  }, [isConnected])

  // Auto-switch to Avalanche Fuji when connected to wrong network
  useEffect(() => {
    if (isConnected && chainId !== avalancheFuji.id) {
      switchChain({ chainId: avalancheFuji.id })
    }
  }, [isConnected, chainId, switchChain])

  // Get letter state from backend results
  const getLetterStateFromResults = (guessIndex: number, letterIndex: number): LetterState => {
    if (guessIndex < guessResults.length) {
      return guessResults[guessIndex].result[letterIndex]
    }
    return 'empty'
  }

  const submitGuess = useCallback(async (guessToSubmit?: string) => {
    const guess = guessToSubmit?.toUpperCase() || currentGuess.toUpperCase()

    if (guess.length !== 5) {
      setShakeRow(true)
      setTimeout(() => setShakeRow(false), 500)
      addLog('Word must be 5 letters', 'error')
      return
    }

    if (!sessionId || !sessionToken) {
      addLog('No active game session', 'error')
      return
    }

    try {
      const result = await api.submitGuess(sessionId, guess, sessionToken)
      console.log('Submit result:', result)

      // Clear guess only on successful submission
      console.log('Setting currentGuess to empty')
      setCurrentGuess('')

      // Update guesses and results
      console.log('Updating guesses array')
      setGuesses(prev => {
        const newGuesses = [...prev, result.guess]
        console.log('New guesses:', newGuesses)
        return newGuesses
      })
      setGuessResults(prev => [...prev, result])

      // Update keyboard state based on result
      const newKeyboardState = { ...keyboardState }
      result.guess.split('').forEach((letter, i) => {
        const state = result.result[i]
        if (!newKeyboardState[letter] ||
            (newKeyboardState[letter] === 'absent' && state !== 'absent') ||
            (newKeyboardState[letter] === 'present' && state === 'correct')) {
          newKeyboardState[letter] = state
        }
      })
      setKeyboardState(newKeyboardState)

      if (result.isCorrect) {
        setGameWon(true)
        setTargetWord(result.word || '')
        setVictoryRow(result.guessNumber - 1)
        setShowConfetti(true)
        addLog(`Correct! You won in ${result.guessNumber} ${result.guessNumber === 1 ? 'try' : 'tries'}!`, 'success')
        // Delay showing the finished screen to let the animation play
        setTimeout(() => {
          setGamePhase('finished')
          setVictoryRow(null)
          setShowConfetti(false)
        }, 2000)
      } else if (result.isGameOver) {
        setTargetWord(result.word || '')
        setGamePhase('finished')
        addLog(`Game over! The word was ${result.word}`, 'error')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit guess'
      // If word is not in the list, shake and reset for next attempt
      if (errorMessage.includes('Not in word list')) {
        setShakeRow(true)
        setTimeout(() => setShakeRow(false), 500)
        addLog('Not in word list', 'error')
        // Reset currentGuess so user can try again on same row
        setCurrentGuess('')
      } else {
        addLog(errorMessage, 'error')
        // Reset on any error to allow continued play
        setCurrentGuess('')
      }
    }
  }, [currentGuess, sessionId, sessionToken, addLog, keyboardState])

  // Track if submission is in progress - use ref for immediate access
  const isSubmittingRef = useRef(false)
  // Track the last submitted guess to prevent duplicate submissions
  const lastSubmittedGuessRef = useRef<string>('')

  // Keyboard input handler
  const handleKeyPress = useCallback((key: string) => {
    if (gamePhase !== 'playing') return
    if (isSubmittingRef.current) return

    if (key === '⌫' || key === 'BACKSPACE') {
      setCurrentGuess(prev => prev.slice(0, -1))
    } else if (key.length === 1 && /[A-Z]/i.test(key)) {
      setCurrentGuess(prev => {
        if (prev.length >= 5) return prev
        const newGuess = (prev + key.toUpperCase()).slice(0, 5)

        // Auto-submit immediately when 5 letters are entered
        if (newGuess.length === 5 && newGuess !== lastSubmittedGuessRef.current) {
          isSubmittingRef.current = true
          lastSubmittedGuessRef.current = newGuess

          // Submit after a tiny delay to let the UI update
          setTimeout(async () => {
            await submitGuess(newGuess)
            isSubmittingRef.current = false
            // Reset last submitted so user can try same word again if needed
            lastSubmittedGuessRef.current = ''
          }, 50)
        }
        return newGuess
      })
    }
  }, [gamePhase, submitGuess])

  // Physical keyboard listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      handleKeyPress(e.key.toUpperCase())
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKeyPress])

  const handleResolve = async () => {
    if (!resolverAddress || playingGameId === null || !address || !sessionId || !sessionToken) return

    try {
      addLog('Requesting signature from server...')

      // Get signature from backend
      const claimResult = await api.claimSignature(sessionId, sessionToken)

      addLog('Claiming WRDL rewards...')
      resolveGame({
        address: WORDLE_ROYALE_ADDRESS,
        abi: WORDLE_ROYALE_ABI,
        functionName: 'resolve',
        args: [
          resolverAddress,
          playingGameId,
          address,
          claimResult.guessCount,
          claimResult.signature as `0x${string}`
        ],
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      addLog(`Error: ${errorMessage}`, 'error')
    }
  }

  const isWrongNetwork = isConnected && chainId !== avalancheFuji.id

  // Render Game Grid
  const renderGrid = () => {
    const rows = []
    for (let i = 0; i < 6; i++) {
      const guess = guesses[i] || ''
      const isCurrentRow = i === guesses.length
      const isVictoryRow = victoryRow === i
      const tiles = []

      for (let j = 0; j < 5; j++) {
        let letter = ''
        let state: LetterState = 'empty'

        if (i < guesses.length) {
          letter = guess[j] || ''
          state = getLetterStateFromResults(i, j)
        } else if (isCurrentRow) {
          letter = currentGuess[j] || ''
          state = letter ? 'active' : 'empty'
        }

        tiles.push(
          <div
            key={j}
            className={`wordle-tile ${state} ${isCurrentRow && shakeRow ? 'shake' : ''} ${isVictoryRow ? 'victory' : ''}`}
            style={{ animationDelay: i < guesses.length ? `${j * 0.1}s` : '0s' }}
          >
            {letter}
          </div>
        )
      }

      rows.push(
        <div key={i} className={`wordle-row ${isVictoryRow ? 'victory-row' : ''}`}>
          {tiles}
        </div>
      )
    }
    return rows
  }

  // Render Virtual Keyboard
  const renderKeyboard = () => {
    return (
      <div className="keyboard">
        {KEYBOARD_ROWS.map((row, i) => (
          <div key={i} className="keyboard-row">
            {row.map((key) => (
              <button
                key={key}
                className={`key ${key.length > 1 ? 'wide' : ''} ${key === '⌫' ? 'delete' : ''} ${keyboardState[key] || ''}`}
                onClick={() => handleKeyPress(key)}
              >
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>
    )
  }

  // Generate confetti particles
  const renderConfetti = () => {
    if (!showConfetti) return null
    const particles = []
    for (let i = 0; i < 50; i++) {
      const left = Math.random() * 100
      const delay = Math.random() * 0.5
      const size = Math.random() * 8 + 6
      particles.push(
        <div
          key={i}
          className="confetti"
          style={{
            left: `${left}%`,
            animationDelay: `${delay}s`,
            width: `${size}px`,
            height: `${size}px`,
          }}
        />
      )
    }
    return <div className="confetti-container">{particles}</div>
  }

  // Render Stats Card
  const renderStatsCard = () => (
    <div className="card stats-card">
      <h2>Your Stats</h2>
      <div className="balances-row">
        <div className="balance-card">
          <span className="balance-value">{balance ? parseFloat(formatEther(balance.value)).toFixed(4) : '0'}</span>
          <div className="balance-token">
            <img src="/avax-icon.svg" alt="AVAX" className="balance-icon avax-icon" />
            <span className="token-name">AVAX</span>
          </div>
        </div>
        <div className="balance-card wrdle-card">
          <span className="balance-value">{tokenBalance ? parseFloat(formatEther(tokenBalance)).toFixed(0) : '0'}</span>
          <div className="balance-token">
            <img src="/wrdl-token.svg" alt="WRDL" className="balance-icon" />
            <span className="token-name">WRDL</span>
          </div>
        </div>
      </div>
      <div className="game-status">
        <div className="stat-box">
          <div className="value">{playerStats ? playerStats[0].toString() : '0'}</div>
          <div className="label">Wins</div>
        </div>
        <div className="stat-box">
          <div className="value">{playerStats ? playerStats[1].toString() : '0'}</div>
          <div className="label">Games</div>
        </div>
        <div className="stat-box">
          <div className="value">{playerStats ? playerStats[3].toString() : '0'}</div>
          <div className="label">Best</div>
        </div>
        <div className="stat-box">
          <div className="value">{playerStats ? playerStats[2].toString() : '0'}</div>
          <div className="label">Streak</div>
        </div>
        <div
          className="stat-box highlight multiplier-box"
          ref={multiplierBoxRef}
          onMouseEnter={() => {
            if (multiplierBoxRef.current) {
              const rect = multiplierBoxRef.current.getBoundingClientRect()
              setTooltipPosition({
                top: rect.top - 8,
                left: rect.left + rect.width / 2
              })
              setShowMultiplierTooltip(true)
            }
          }}
          onMouseLeave={() => setShowMultiplierTooltip(false)}
        >
          <div className="value">{streakMultiplier ? `${(Number(streakMultiplier) / 10000).toFixed(1)}x` : '1x'}</div>
          <div className="label">Multiplier</div>
          <span className="info-icon desktop-only">
            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
              <path d="M8 0a8 8 0 1 0 8 8A8 8 0 0 0 8 0zm0 14.5A6.5 6.5 0 1 1 14.5 8 6.5 6.5 0 0 1 8 14.5zM8 4a1 1 0 1 1-1 1 1 1 0 0 1 1-1zm1.5 8h-3v-1h1V8h-1V7h2v4h1z"/>
            </svg>
          </span>
        </div>
      </div>

      {/* Mobile dropdown for multiplier info */}
      <div className="multiplier-dropdown mobile-only">
        <button
          className={`multiplier-dropdown-toggle ${showMultiplierTooltip ? 'open' : ''}`}
          onClick={() => setShowMultiplierTooltip(!showMultiplierTooltip)}
        >
          <span>How multiplier works</span>
          <svg
            className="dropdown-chevron"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div className={`multiplier-dropdown-content ${showMultiplierTooltip ? 'open' : ''}`}>
          <div className="multiplier-info-grid">
            <div className="multiplier-info-row">
              <span className="streak-label">3 wins streak</span>
              <span className="multiplier-value">1.2x</span>
            </div>
            <div className="multiplier-info-row">
              <span className="streak-label">5 wins streak</span>
              <span className="multiplier-value">1.5x</span>
            </div>
            <div className="multiplier-info-row">
              <span className="streak-label">7 wins streak</span>
              <span className="multiplier-value">2x</span>
            </div>
            <div className="multiplier-info-row">
              <span className="streak-label">10 wins streak</span>
              <span className="multiplier-value">3x</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // Render Rewards Card
  const renderRewardsCard = () => (
    <div className="card rewards-card">
      <h2>WRDL Rewards</h2>

      <div className="rewards-compact">
        <div className="reward-item main">
          <span className="reward-label">Base Win Reward</span>
          <span className="reward-amount">100 WRDL</span>
        </div>
        <div className="reward-item bonus">
          <span className="reward-label">Perfect Game (1 guess)</span>
          <span className="reward-amount">+100 WRDL</span>
        </div>
        <div className="reward-item bonus">
          <span className="reward-label">Milestones (10/50/100 wins)</span>
          <span className="reward-amount">+100/500/1K</span>
        </div>
      </div>

      {prizePool !== undefined && (
        <div className="prize-pool-display">
          <div className="prize-pool-label">Prize Pool</div>
          <div className="prize-pool-amount">
            {parseFloat(formatEther(prizePool)).toFixed(0)} WRDL
          </div>
        </div>
      )}
    </div>
  )

  // Render Leaderboard Card
  const renderLeaderboardCard = (scrollable = false) => (
    <div className={`card ${scrollable ? 'card-scrollable' : ''}`}>
      <h2>Weekly Leaderboard</h2>
      {leaderboardData && leaderboardData[0].length > 0 ? (
        <>
          <div className="leaderboard">
            {leaderboardData[0]
              .map((player, i) => ({ player, wins: leaderboardData[1][i] }))
              .sort((a, b) => Number(b.wins) - Number(a.wins))
              .slice(0, 10)
              .map((entry, rank) => (
                <div
                  key={rank}
                  className={`leaderboard-row ${entry.player === address ? 'you' : ''}`}
                >
                  <span className="rank">
                    {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`}
                  </span>
                  <span className="player-address">
                    {entry.player.slice(0, 6)}...{entry.player.slice(-4)}
                    {entry.player === address && ' (You)'}
                  </span>
                  <span className="wins">{entry.wins.toString()} wins</span>
                </div>
              ))}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '12px', textAlign: 'center' }}>
            Top 10 players share bonus WRDL rewards weekly
          </p>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🏆</div>
          <p>No winners yet this week!</p>
          <p className="hint">Be the first to claim a spot</p>
        </div>
      )}
    </div>
  )

  // Render How It Works Card
  const renderHowItWorksCard = (scrollable = false) => (
    <div className={`card how-it-works-card ${scrollable ? 'card-scrollable' : ''}`}>
      <h2>How It Works</h2>
      <div className="how-steps">
        <div className="how-step">
          <span className="step-icon">1</span>
          <div className="step-content">
            <h4>Connect Wallet</h4>
            <p>Connect your wallet to start playing for free</p>
          </div>
        </div>
        <div className="how-step">
          <span className="step-icon">2</span>
          <div className="step-content">
            <h4>Guess the Word</h4>
            <p>You have 6 tries to guess the 5-letter word</p>
          </div>
        </div>
        <div className="how-step">
          <span className="step-icon">3</span>
          <div className="step-content">
            <h4>Earn WRDL</h4>
            <p>Win to earn WRDL tokens</p>
          </div>
        </div>
      </div>
    </div>
  )

  // Render Wordlanche Banner Card
  const renderBuyWrdlCard = () => (
    <div className="card buy-wrdl-card wordlanche-banner">
      <div className="buy-wrdl-content">
        <div className="buy-wrdl-text">
          <span className="buy-wrdl-title">Wordlanche on Avalanche Fuji</span>
        </div>
        <span className="buy-wrdl-btn avax-badge">Testnet</span>
      </div>
    </div>
  )

  // Render Play Card
  const renderPlayCard = () => (
    <div className="card play-card">
      <div className="play-spacer play-spacer-top"></div>

      <div className="play-hero">
        <div className="play-icon">🎮</div>
        <h2 className="play-title">Play Wordlanche</h2>
      </div>

      <div className="play-spacer">
        <div className="color-guide">
          <div className="guide-item">
            <span className="guide-tile correct">A</span>
            <span>Correct spot</span>
          </div>
          <div className="guide-item">
            <span className="guide-tile present">B</span>
            <span>Wrong spot</span>
          </div>
          <div className="guide-item">
            <span className="guide-tile absent">C</span>
            <span>Not in word</span>
          </div>
        </div>
      </div>

      <button
        className="btn btn-success play-btn"
        onClick={handleJoin}
        disabled={isJoining || isJoinConfirming}
      >
        {isJoining || isJoinConfirming ? 'Starting...' : 'Play Now - FREE!'}
      </button>
    </div>
  )

  // Render Game Card (playing phase)
  const renderGameCard = () => (
    <div className="card game-card">
      <div className="card-content">
        <div className="wordle-container">
          {renderGrid()}
        </div>
        {renderKeyboard()}
      </div>
    </div>
  )

  // Render Result Card (finished phase)
  const renderResultCard = () => {
    // Calculate rewards
    const baseReward = 100
    const isPerfectGame = guesses.length === 1
    const perfectBonus = isPerfectGame ? 100 : 0

    // Check milestones (wins after this game)
    const currentWins = playerStats ? Number(playerStats[0]) : 0
    const isMilestone10 = currentWins === 10
    const isMilestone50 = currentWins === 50
    const isMilestone100 = currentWins === 100
    const milestoneBonus = isMilestone10 ? 100 : isMilestone50 ? 500 : isMilestone100 ? 1000 : 0

    // Streak multiplier
    const multiplier = streakMultiplier ? Number(streakMultiplier) / 10000 : 1

    // Total reward
    const totalBeforeMultiplier = baseReward + perfectBonus + milestoneBonus
    const totalReward = Math.floor(totalBeforeMultiplier * multiplier)

    return (
    <div className="card result-card">
      <div className="card-content">
        <div className="result-icon">{gameWon ? '🏆' : '😔'}</div>
        <h2 className={`result-title ${gameWon ? 'win' : 'lose'}`}>
          {gameWon ? 'Victory!' : 'Game Over'}
        </h2>
        <p className="result-word">
          The word was: <strong>{targetWord}</strong>
        </p>

        {gameWon && (
          <div className="prize-display">
            <div className="prize-amount">{totalReward} WRDL</div>
            <div className="prize-label">Your Reward</div>
            <div className="prize-breakdown">
              {isPerfectGame && <span className="prize-bonus">Perfect Game +100</span>}
              {milestoneBonus > 0 && <span className="prize-bonus">{currentWins} Wins Milestone +{milestoneBonus}</span>}
              {multiplier > 1 && <span className="prize-bonus">{multiplier}x Streak Multiplier</span>}
            </div>
          </div>
        )}

        {isResolved && (
          <p className="result-claimed">WRDL Rewards claimed!</p>
        )}
      </div>

      <div className="result-actions">
        <button
          className="btn"
          onClick={() => { setGamePhase('lobby'); setPlayingGameId(null); }}
        >
          Play Again
        </button>
        {gameWon && !isResolved && (
          <button
            className="btn"
            onClick={handleResolve}
            disabled={isResolving || isResolveConfirming}
          >
            {isResolving || isResolveConfirming ? 'Claiming...' : 'Claim WRDL'}
          </button>
        )}
      </div>
      {gameWon && (
        <a
          className="btn share-btn"
          href={`https://x.com/intent/tweet?text=${encodeURIComponent(`I just won ${totalReward} $WRDL in ${guesses.length}/6 tries! 🏆\n\nCan you beat my score?\n\nPlay Wordlanche on Avalanche!`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Share
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </a>
      )}
    </div>
  )
  }

  // Render Contract Info Footer
  const renderContractInfo = () => (
    <div className="contract-info">
      <span>Game:</span>
      <a href={`https://testnet.snowtrace.io/address/${WORDLE_ROYALE_ADDRESS}`} target="_blank" rel="noopener noreferrer">
        {WORDLE_ROYALE_ADDRESS.slice(0, 10)}...
      </a>
      <span>|</span>
      <span>Token:</span>
      <a href={`https://testnet.snowtrace.io/address/${WORDLE_TOKEN_ADDRESS}`} target="_blank" rel="noopener noreferrer">
        {WORDLE_TOKEN_ADDRESS.slice(0, 10)}...
      </a>
    </div>
  )

  return (
    <div className="app-frame">
      <div className="container">
        {renderConfetti()}

        <header>
        <div className="header-left">
          <div className="logo">
            <h1>Wordlanche</h1>
          </div>
          <span className="network-badge">Avalanche Fuji</span>
        </div>
        <div className="header-right">
          <a href="https://x.com/" target="_blank" rel="noopener noreferrer" className="social-link">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <div className="header-divider"></div>
          {!isConnected ? (
            <button className="btn header-wallet-btn-lg" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          ) : (
            <button className="btn header-wallet-btn-lg" onClick={() => disconnect()}>
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </button>
          )}
        </div>
      </header>

      {!isConnected ? (
        <div className="homepage-split">
          {/* Left side - Message */}
          <div className="homepage-left homepage-left-play">
            <div className="homepage-message">
              <h2 className="homepage-title"><span className="title-dot">•</span> Play & Earn WRDL <span className="title-dot">•</span></h2>
              <p className="homepage-desc">
                Guess the word, win tokens.
              </p>
              <div className="homepage-buttons-row">
                <button
                  className="btn homepage-play-btn"
                  onClick={handleConnect}
                  disabled={isConnecting}
                >
                  <span>{isConnecting ? 'Connecting...' : 'Start Playing'}</span>
                </button>
                <a
                  href="https://testnet.snowtrace.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn homepage-buy-btn"
                >
                  Explorer
                </a>
              </div>
              <p className="homepage-free-info">
                100% Free to Play
              </p>
            </div>
            <div className="homepage-bottom">
              <div className="homepage-powered-by">
                <span>Powered by</span>
                <a href="https://www.avax.network/" target="_blank" rel="noopener noreferrer" className="avax-link">
                  <img src="/avalanche-logo.png" alt="Avalanche" className="avax-logo" />
                </a>
              </div>
            </div>
          </div>

          {/* Right side - Animated Mockup */}
          <div className="homepage-right">
            <div className="game-mockup">
              <div className="mockup-header">
                <h3 className="mockup-title">How to Play</h3>
                <p className="mockup-subtitle">Guess the 5-letter word in 6 tries</p>
              </div>
              <div className="mockup-game-area">
                <MockupGame />
              </div>
              <div className="mockup-footer">
                <p className="mockup-reward-info">Win <strong>WRDL tokens</strong> with every victory!</p>
              </div>
            </div>
          </div>
        </div>
      ) : isWrongNetwork ? (
        <div className="card connect-screen">
          <div className="card-content">
            <div className="connect-icon">🔄</div>
            <h2 className="connect-title" style={{ justifyContent: 'center' }}>Switching Network...</h2>
            <p className="connect-desc">
              Please approve the network switch to Avalanche Fuji in your wallet.
            </p>
          </div>
          <button className="btn" onClick={() => switchChain({ chainId: avalancheFuji.id })}>
            Switch to Avalanche Fuji
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => disconnect()}
            style={{ marginTop: '12px' }}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <>
          {/* MOBILE LAYOUT - Stacked cards */}
          <div className="mobile-content">
            {renderBuyWrdlCard()}
            {gamePhase === 'lobby' && renderPlayCard()}
            {gamePhase === 'playing' && renderGameCard()}
            {gamePhase === 'finished' && renderResultCard()}

            {renderStatsCard()}

            {gamePhase === 'lobby' && renderRewardsCard()}
            {gamePhase === 'lobby' && renderLeaderboardCard()}
            {renderHowItWorksCard()}
            {renderContractInfo()}
          </div>

          {/* TABLET LAYOUT - Stats+Game stacked on top (70%), 3 cards below (30%) */}
          <div className="tablet-content">
            {renderBuyWrdlCard()}
            <div className="tablet-top-col">
              {renderStatsCard()}
              {gamePhase === 'lobby' && renderPlayCard()}
              {gamePhase === 'playing' && renderGameCard()}
              {gamePhase === 'finished' && renderResultCard()}
            </div>
            <div className="tablet-cards-row">
              {renderHowItWorksCard()}
              {renderRewardsCard()}
              {renderLeaderboardCard()}
            </div>
            {renderContractInfo()}
          </div>

          {/* DESKTOP LAYOUT - 3 columns */}
          <div className="desktop-content">
            <div className="desktop-layout">
              {/* Left Column - Stats, Rewards, Activity */}
              <div className="desktop-left">
                {renderStatsCard()}
                {renderRewardsCard()}
                {renderHowItWorksCard(true)}
              </div>

              {/* Center Column - Game Area */}
              <div className="desktop-center">
                {renderBuyWrdlCard()}
                {gamePhase === 'lobby' && renderPlayCard()}
                {gamePhase === 'playing' && renderGameCard()}
                {gamePhase === 'finished' && renderResultCard()}
                {renderContractInfo()}
              </div>

              {/* Right Column - Leaderboard */}
              <div className="desktop-right">
                {renderLeaderboardCard(true)}
              </div>
            </div>
          </div>
        </>
      )}
      </div>

      <footer>
        <div className="footer-main">
          <div className="footer-brand">
            <div className="logo">
              <h1>Wordlanche</h1>
            </div>
            <p className="footer-tagline">Play Free. Guess Words. Earn WRDL.</p>
          </div>

          <div className="footer-links">
            <div className="footer-column">
              <div className="footer-social">
                <a href="https://x.com/" target="_blank" rel="noopener noreferrer" className="social-link">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-network">
            <span className="network-badge">Avalanche Fuji</span>
          </div>
          <div className="footer-copyright">
            <p>© 2025 Wordlanche</p>
            <p className="built-on-avax">
              Built on{' '}
              <a href="https://www.avax.network/" target="_blank" rel="noopener noreferrer" className="avax-link">
                Avalanche
              </a>
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile Wallet Selector Modal */}
      <MobileWalletSelector
        isOpen={showMobileWalletSelector}
        onClose={() => setShowMobileWalletSelector(false)}
        onSelectWallet={handleMobileWalletSelect}
      />

      {/* Multiplier Tooltip Portal */}
      {showMultiplierTooltip && createPortal(
        <div
          className="multiplier-tooltip-portal"
          style={{
            position: 'fixed',
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
          }}
        >
          <div className="tooltip-title">Streak Multiplier</div>
          <div className="tooltip-row"><span>3 wins</span><span>1.2x</span></div>
          <div className="tooltip-row"><span>5 wins</span><span>1.5x</span></div>
          <div className="tooltip-row"><span>7 wins</span><span>2x</span></div>
          <div className="tooltip-row"><span>10 wins</span><span>3x</span></div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default App

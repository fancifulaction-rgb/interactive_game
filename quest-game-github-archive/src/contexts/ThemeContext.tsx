import { createContext, useContext, useEffect, useState } from 'react'

interface Theme {
  id: string
  name: string
  display_name: string
  colors: {
    primary: string
    secondary: string
    background: string
  }
  effects: Record<string, boolean>
}

interface ThemeContextType {
  currentTheme: Theme | null
  themes: Theme[]
  setTheme: (themeName: string) => void
  applyThemeToDOM: (theme: Theme | null) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null)
  const [themes, setThemes] = useState<Theme[]>([])

  // Загрузка тем из базы данных
  useEffect(() => {
    const loadThemes = async () => {
      try {
        const { data, error } = await supabase
          .from('themes')
          .select('*')
          .order('display_name', { ascending: true })

        if (error) throw error
        setThemes(data || [])
        
        // Применяем тему по умолчанию (если игра не указала свою тему)
        const defaultTheme = (data || []).find(theme => theme.name === 'default')
        if (defaultTheme && !currentTheme) {
          setCurrentTheme(defaultTheme)
          applyThemeToDOM(defaultTheme)
        }
      } catch (err: any) {
        console.error('Ошибка загрузки тем:', err)
      }
    }

    loadThemes()
  }, [])

  const applyThemeToDOM = (theme: Theme | null) => {
    if (!theme) return

    // Создаем или обновляем CSS переменные
    let styleElement = document.getElementById('theme-variables') as HTMLStyleElement
    if (!styleElement) {
      styleElement = document.createElement('style')
      styleElement.id = 'theme-variables'
      document.head.appendChild(styleElement)
    }

    styleElement.textContent = `
      :root {
        --theme-primary: ${theme.colors.primary};
        --theme-secondary: ${theme.colors.secondary};
        --theme-background: ${theme.colors.background};
      }
      
      .theme-primary {
        background-color: var(--theme-primary);
        color: white;
      }
      
      .theme-secondary {
        background-color: var(--theme-secondary);
        color: white;
      }
      
      .theme-background {
        background-color: var(--theme-background);
      }
      
      .theme-primary-text {
        color: var(--theme-primary);
      }
      
      .theme-secondary-text {
        color: var(--theme-secondary);
      }
      
      .theme-border-primary {
        border-color: var(--theme-primary);
      }
      
      .theme-border-secondary {
        border-color: var(--theme-secondary);
      }
      
      .theme-hover-primary:hover {
        background-color: var(--theme-primary);
        color: white;
      }
      
      .theme-hover-secondary:hover {
        background-color: var(--theme-secondary);
        color: white;
      }
    `

    // Применяем специальные эффекты
    if (theme.effects.snow) {
      enableSnowEffect()
    } else {
      disableSnowEffect()
    }

    if (theme.effects.flowers) {
      enableFlowersEffect()
    } else {
      disableFlowersEffect()
    }

    if (theme.effects.confetti) {
      enableConfettiEffect()
    } else {
      disableConfettiEffect()
    }
  }

  const setTheme = (themeName: string) => {
    const theme = themes.find(t => t.name === themeName)
    if (theme) {
      setCurrentTheme(theme)
      applyThemeToDOM(theme)
    }
  }

  // Эффект снега
  const enableSnowEffect = () => {
    if (document.getElementById('snow-effect')) return

    const snowContainer = document.createElement('div')
    snowContainer.id = 'snow-effect'
    snowContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      overflow: hidden;
    `
    document.body.appendChild(snowContainer)

    for (let i = 0; i < 50; i++) {
      const snowflake = document.createElement('div')
      snowflake.innerHTML = '❄'
      snowflake.style.cssText = `
        position: absolute;
        color: white;
        font-size: ${Math.random() * 10 + 10}px;
        top: -20px;
        left: ${Math.random() * 100}%;
        animation: snow-fall ${Math.random() * 3 + 2}s linear infinite;
        opacity: ${Math.random() * 0.8 + 0.2};
      `
      snowContainer.appendChild(snowflake)
    }

    // Добавляем CSS анимацию если её нет
    if (!document.getElementById('snow-animation')) {
      const style = document.createElement('style')
      style.id = 'snow-animation'
      style.textContent = `
        @keyframes snow-fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
          }
          100% {
            transform: translateY(100vh) rotate(360deg);
          }
        }
      `
      document.head.appendChild(style)
    }
  }

  const disableSnowEffect = () => {
    const snowContainer = document.getElementById('snow-effect')
    if (snowContainer) {
      snowContainer.remove()
    }
  }

  // Эффект цветов
  const enableFlowersEffect = () => {
    if (document.getElementById('flowers-effect')) return

    const flowersContainer = document.createElement('div')
    flowersContainer.id = 'flowers-effect'
    flowersContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      overflow: hidden;
    `
    document.body.appendChild(flowersContainer)

    const flowers = ['🌸', '🌺', '🌻', '🌼']
    
    for (let i = 0; i < 30; i++) {
      const flower = document.createElement('div')
      flower.innerHTML = flowers[Math.floor(Math.random() * flowers.length)]
      flower.style.cssText = `
        position: absolute;
        font-size: ${Math.random() * 15 + 15}px;
        bottom: -20px;
        left: ${Math.random() * 100}%;
        animation: flowers-float ${Math.random() * 4 + 3}s ease-in-out infinite;
        opacity: ${Math.random() * 0.7 + 0.3};
      `
      flowersContainer.appendChild(flower)
    }

    if (!document.getElementById('flowers-animation')) {
      const style = document.createElement('style')
      style.id = 'flowers-animation'
      style.textContent = `
        @keyframes flowers-float {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-50vh) rotate(180deg);
          }
        }
      `
      document.head.appendChild(style)
    }
  }

  const disableFlowersEffect = () => {
    const flowersContainer = document.getElementById('flowers-effect')
    if (flowersContainer) {
      flowersContainer.remove()
    }
  }

  // Эффект конфетти
  const enableConfettiEffect = () => {
    if (document.getElementById('confetti-effect')) return

    const confettiContainer = document.createElement('div')
    confettiContainer.id = 'confetti-effect'
    confettiContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      overflow: hidden;
    `
    document.body.appendChild(confettiContainer)

    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd']
    
    for (let i = 0; i < 100; i++) {
      const confetti = document.createElement('div')
      confetti.style.cssText = `
        position: absolute;
        width: 8px;
        height: 8px;
        background-color: ${colors[Math.floor(Math.random() * colors.length)]};
        top: -20px;
        left: ${Math.random() * 100}%;
        animation: confetti-fall ${Math.random() * 2 + 2}s linear infinite;
        transform: rotate(${Math.random() * 360}deg);
      `
      confettiContainer.appendChild(confetti)
    }

    if (!document.getElementById('confetti-animation')) {
      const style = document.createElement('style')
      style.id = 'confetti-animation'
      style.textContent = `
        @keyframes confetti-fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `
      document.head.appendChild(style)
    }
  }

  const disableConfettiEffect = () => {
    const confettiContainer = document.getElementById('confetti-effect')
    if (confettiContainer) {
      confettiContainer.remove()
    }
  }

  const value = {
    currentTheme,
    themes,
    setTheme,
    applyThemeToDOM
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// Импорт supabase для загрузки тем
import { supabase } from '../lib/supabase'

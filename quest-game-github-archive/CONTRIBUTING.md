# 🤝 Руководство по участию в разработке

Спасибо за интерес к проекту Quest Game! Мы приветствуем любые вклады в развитие платформы.

## 📋 Как внести вклад

### 🐛 Сообщить об ошибке
1. Проверьте `docs/BACKLOG.md` и открытые задачи в вашем трекере
2. Создайте новый Issue с детальным описанием:
   - Шаги для воспроизведения
   - Ожидаемое поведение
   - Фактическое поведение
   - Скриншоты (если применимо)
   - Версия браузера и ОС

### 💡 Предложить новую функцию
1. Создайте Issue с меткой "enhancement"
2. Опишите желаемую функциональность
3. Объясните, почему это будет полезно
4. Дождитесь обсуждения перед началом разработки

### 🔧 Внести изменения в код

1. **Fork репозитория**
```bash
cd quest-game-github-archive
```

2. **Создайте ветку для изменений**
```bash
git checkout -b feature/amazing-feature
# или
git checkout -b bugfix/fix-something
```

3. **Настройте окружение разработки**
```bash
npm install
cp .env.example .env
# Заполните .env файл
npm run dev
```

4. **Внесите изменения**
   - Следуйте стилю кода проекта
   - Добавьте комментарии для сложной логики
   - Обновите документацию при необходимости

5. **Протестируйте изменения**
```bash
npm run build
npm run lint
```

6. **Commit изменения**
```bash
git add .
git commit -m "feat: add amazing new feature"
# или
git commit -m "fix: resolve issue with component"
```

7. **Push изменения**
```bash
git push origin feature/amazing-feature
```

8. **Создайте Pull Request**
   - Опишите изменения
   - Ссылайтесь на связанные Issues
   - Добавьте скриншоты для UI изменений

## 📝 Стандарты кода

### TypeScript
- Используйте строгую типизацию
- Избегайте `any` типов
- Создавайте интерфейсы для сложных объектов

### React компоненты
- Используйте функциональные компоненты с hooks
- Следуйте принципу единственной ответственности
- Добавляйте PropTypes или TypeScript интерфейсы

### Стиль кода
- 2 пробела для отступов
- Точка с запятой в конце строк
- Одинарные кавычки для строк
- Trailing comma в объектах и массивах

### Именование
- camelCase для переменных и функций
- PascalCase для компонентов и интерфейсов
- UPPER_SNAKE_CASE для констант
- kebab-case для файлов

## 🗃️ Структура коммитов

Используйте [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - новая функциональность
- `fix:` - исправление ошибки
- `docs:` - изменения в документации
- `style:` - форматирование, отсутствующие точки с запятой и т.д.
- `refactor:` - рефакторинг кода
- `test:` - добавление или исправление тестов
- `chore:` - изменения в build процессе или вспомогательных инструментах

Примеры:
```
feat: add team avatar upload functionality
fix: resolve duplicate question issue in GameEditor
docs: update installation instructions
refactor: optimize team deletion logic
```

## 🧪 Тестирование

### Перед отправкой PR
1. Убедитесь, что приложение собирается без ошибок
2. Протестируйте изменения в браузере
3. Проверьте мобильную версию
4. Убедитесь, что не сломана существующая функциональность

### Тестовые сценарии
- Создание и редактирование игры
- Регистрация команды
- Прохождение квеста
- Работа админ панели
- Экспорт данных

## 🚀 Развертывание

Основная ветка `main` автоматически деплоится на production.
- Убедитесь, что ваши изменения не сломают production
- Большие изменения должны быть сначала протестированы на dev окружении

## 📚 Ресурсы

### Документация проекта
- [docs/QUEST_GAME_PROJECT_COMPLETE_DESCRIPTION.md](docs/QUEST_GAME_PROJECT_COMPLETE_DESCRIPTION.md)
- [docs/DEPLOYMENT_INSTRUCTIONS.md](docs/DEPLOYMENT_INSTRUCTIONS.md)

### Технологии
- [React Documentation](https://reactjs.org/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)

## ❓ Вопросы

Если у вас есть вопросы:
1. Опишите проблему в issue трекера проекта
2. Прочитайте документацию в папке `docs/`
3. Создайте новый Issue с меткой "question"

## 🏆 Контрибьюторы

Благодарность всем, кто внес вклад в развитие проекта!

---

**Спасибо за ваш вклад в Quest Game! 🎮**
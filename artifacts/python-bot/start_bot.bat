@echo off
title Westrade Bot
cd /d C:\Users\Ilyes\westrade\artifacts\python-bot
echo Pulling latest bot code...
git reset --hard HEAD
git pull origin claude/fix-empty-message-error-3H3Wn
echo.
echo Starting Westrade bot...
python bot.py
pause

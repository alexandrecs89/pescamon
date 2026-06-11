@echo off
cd /d C:\Users\alexa\OneDrive\Documents\Pescamon\CascadeProjects\windsurf-project
start /B python -m http.server 3000 --directory dist > server.log 2>&1
echo Server started on port 3000

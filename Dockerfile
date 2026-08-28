# Use the official lightweight Node.js 20 base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available) first
COPY package*.json ./

# Install all dependencies (including devDependencies like javascript-obfuscator)
RUN npm install

# Copy the rest of the application source code
COPY . .

# Run the build step to minify and obfuscate the client-side app.js
RUN npm run build

# Prune devDependencies to keep the production image as small as possible
RUN npm prune --production

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]

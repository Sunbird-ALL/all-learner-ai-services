# Use an official Node.js runtime as the base image
FROM node:16.13.2

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install the application dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Set environment variables
ENV DATABASE=mongodb
ENV PORT=3001
ENV MONGO_URL=
ENV MYSQL_HOST=
ENV MYSQL_PORT=
ENV MYSQL_USERNAME=
ENV MYSQL_PASSWORD=
ENV MYSQL_DATABASE=

# Expose the port on which the application will run
EXPOSE $PORT

# Start the application
CMD ["npm", "run", "start:prod"]

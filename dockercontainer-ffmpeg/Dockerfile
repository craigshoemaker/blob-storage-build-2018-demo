FROM openjdk:8

RUN apt-get update && apt-get install ffmpeg -y
RUN mkdir /opt/start

WORKDIR /opt/start
COPY transcode.jar /opt/start

ENTRYPOINT ["java", "-jar", "transcode.jar"]
sudo su -

cd /usr/local/bin
mkdir ffmpeg

cd ffmpeg
wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar xvf ffmpeg-4.2.1-amd64-static.tar.xz
mv ffmpeg-4.2.1-amd64-static/ffmpeg .

ln -s /usr/local/bin/ffmpeg/ffmpeg /usr/bin/ffmpeg
exit

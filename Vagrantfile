Vagrant.configure("2") do |config|
	config.vm.box = "precise64"
	config.vm.box_url = 'http://files.vagrantup.com/precise64.box'
	config.vm.hostname = "git-hours"
	config.vm.provision :shell, :inline => "apt-get -y update && sudo apt-get -y install git python-software-properties python g++ make && add-apt-repository -y ppa:chris-lea/node.js"
	config.vm.provision :shell, :inline => "apt-get -y update && apt-get -y install nodejs"
	config.vm.provision :shell, :inline => "npm install -g mocha nodegit"
	config.vm.provision :shell, :inline => "echo -e '#!/bin/bash\ncp -R /vagrant git-hours\n sudo npm install git-hours -g' > install_shared_folder.sh"
	config.vm.provision :shell, :inline => "chmod u+x install_shared_folder.sh; su vagrant -c 'bash install_shared_folder.sh'"
end

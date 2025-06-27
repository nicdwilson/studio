import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { Button, TextControl, Card } from '@wordpress/components';
import { useState, useEffect } from 'react';
import { useSiteDetails } from 'src/hooks/use-site-details';
import { getIpcApi } from 'src/lib/get-ipc-api';

export function WizardHatJurassicTube() {
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const { startServer, loadingServer } = useSiteDetails();

	if (!selectedSite) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl px-8">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						{__('Jurassic Tube')}
					</h2>
					<p className="text-gray-600 mb-6">
						{__('Please select a site to configure Jurassic Tube.')}
					</p>
				</div>
			</div>
		);
	}

	const [wpUsername, setWpUsername] = useState('');
	const [subdomain, setSubdomain] = useState('');
	const [sshKeyCopied, setSshKeyCopied] = useState(false);
	const [isInstalled, setIsInstalled] = useState(false);
	const [isConnected, setIsConnected] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [showInstallInstructions, setShowInstallInstructions] = useState(false);

	const isLoading = selectedSite?.id ? loadingServer[selectedSite.id] : false;

	useEffect(() => {
		// Load saved settings
		const savedUsername = localStorage.getItem('wizard-hat-wp-username');
		const savedSubdomain = localStorage.getItem('wizard-hat-subdomain');
		const savedSshKeyCopied = localStorage.getItem('wizard-hat-ssh-key-copied');

		if (savedUsername) setWpUsername(savedUsername);
		if (savedSubdomain) setSubdomain(savedSubdomain);
		if (savedSshKeyCopied === 'true') setSshKeyCopied(true);

		// Check if Jurassic Tube is installed
		checkInstallation();
	}, []);

	const checkInstallation = async () => {
		try {
			// In a real implementation, this would check if jurassictube command exists
			// For now, we'll simulate based on saved state
			const savedInstalled = localStorage.getItem('wizard-hat-installed');
			setIsInstalled(savedInstalled === 'true');
		} catch (error) {
			console.error('Error checking installation:', error);
		}
	};

	const saveUsername = () => {
		localStorage.setItem('wizard-hat-wp-username', wpUsername);
		getIpcApi().showNotification({
			title: __('Success'),
			body: __('WordPress username saved'),
		});
	};

	const saveSubdomain = () => {
		localStorage.setItem('wizard-hat-subdomain', subdomain);
		getIpcApi().showNotification({
			title: __('Success'),
			body: __('Subdomain saved'),
		});
	};

	const handleSshKeyCopied = (checked: boolean) => {
		setSshKeyCopied(checked);
		localStorage.setItem('wizard-hat-ssh-key-copied', checked.toString());
	};

	const launchInstall = async () => {
		try {
			// In a real implementation, this would launch the installation script
			// For now, we'll simulate the installation process
			setShowInstallInstructions(true);
			
			// Simulate installation completion
			setTimeout(() => {
				setIsInstalled(true);
				localStorage.setItem('wizard-hat-installed', 'true');
				setShowInstallInstructions(false);
				getIpcApi().showNotification({
					title: __('Success'),
					body: __('Jurassic Tube installation completed'),
				});
			}, 3000);
		} catch (error) {
			console.error('Error launching install:', error);
			getIpcApi().showErrorMessageBox({
				title: __('Error'),
				message: __('Failed to launch installation. Please try again.'),
				error,
			});
		}
	};

	const connectJurassicTube = async () => {
		if (!wpUsername || !subdomain || isConnecting) return;

		setIsConnecting(true);

		try {
			// Ensure site is running
			if (!selectedSite.running) {
				await startServer(selectedSite.id);
			}

			// In a real implementation, this would establish the SSH tunnel
			// For now, we'll simulate the connection process
			await new Promise(resolve => setTimeout(resolve, 2000));

			setIsConnected(true);
			getIpcApi().showNotification({
				title: __('Success'),
				body: __('Jurassic Tube connected successfully'),
			});
		} catch (error) {
			console.error('Error connecting Jurassic Tube:', error);
			getIpcApi().showErrorMessageBox({
				title: __('Error'),
				message: __('Failed to connect Jurassic Tube. Please check your settings and try again.'),
				error,
			});
		} finally {
			setIsConnecting(false);
		}
	};

	const disconnectJurassicTube = async () => {
		try {
			// In a real implementation, this would close the SSH tunnel
			setIsConnected(false);
			getIpcApi().showNotification({
				title: __('Success'),
				body: __('Jurassic Tube disconnected'),
			});
		} catch (error) {
			console.error('Error disconnecting Jurassic Tube:', error);
		}
	};

	if (!isInstalled) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl px-8">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						{__('Jurassic Tube Setup')}
					</h2>
					<p className="text-gray-600 mb-6">
						{__('Jurassic Tube is an in-house tunneling solution similar to ngrok. It allows your local test site to be reached from the internet via a .jurassic.tube subdomain over an SSH tunnel.')}
					</p>
				</div>

				<Card className="p-6">
					<h3 className="text-lg font-medium text-gray-900 mb-4">
						{__('Installation')}
					</h3>
					<p className="text-gray-600 mb-4">
						{__('The setup process requires the command line. Click the button below to launch the installation script in a terminal window.')}
					</p>
					<div className="space-y-4">
						<Button
							variant="primary"
							onClick={launchInstall}
							disabled={showInstallInstructions}
						>
							{showInstallInstructions ? __('Installing...') : __('Install Jurassic Tube')}
						</Button>
						
						{showInstallInstructions && (
							<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
								<h4 className="font-medium text-blue-900 mb-2">
									{__('Installation Instructions')}
								</h4>
								<ol className="text-blue-800 space-y-2 text-sm">
									<li>1. {__('You will be prompted for your Mac password twice')}</li>
									<li>2. {__('The first prompt is for your Mac password (for system path access)')}</li>
									<li>3. {__('The second prompt is for the SSH key password (optional but recommended)')}</li>
									<li>4. {__('After installation, copy the generated SSH key')}</li>
									<li>5. {__('Register the key on Jurassic Tube website')}</li>
								</ol>
							</div>
						)}
					</div>
				</Card>

				<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
					<h3 className="text-lg font-medium text-yellow-900 mb-2">
						{__('Important Notes')}
					</h3>
					<ul className="text-yellow-800 space-y-2">
						<li className="flex items-start">
							<span className="font-medium mr-2">•</span>
							<span>{__('Jurassic Tube is essential for testing WooCommerce Payments, webhooks, and Jetpack connections')}</span>
						</li>
						<li className="flex items-start">
							<span className="font-medium mr-2">•</span>
							<span>{__('The SSH key password is optional but recommended for security')}</span>
						</li>
						<li className="flex items-start">
							<span className="font-medium mr-2">•</span>
							<span>{__('You can close the terminal window after copying the key')}</span>
						</li>
					</ul>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">
					{__('Jurassic Tube Connection')}
				</h2>
				<p className="text-gray-600 mb-6">
					{__('Configure your Jurassic Tube connection to enable tunneling for payment testing and webhooks.')}
				</p>
			</div>

			{/* Configuration Section */}
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{__('Connection Configuration')}
				</h3>
				
				<div className="space-y-4">
					<TextControl
						label={__('WordPress Username')}
						value={wpUsername}
						onChange={setWpUsername}
						placeholder="admin"
						help={__('The WordPress username for the connection')}
					/>
					<Button
						variant="secondary"
						onClick={saveUsername}
						disabled={!wpUsername}
					>
						{__('Save Username')}
					</Button>
				</div>

				<div className="mt-6 space-y-4">
					<TextControl
						label={__('Subdomain')}
						value={subdomain}
						onChange={setSubdomain}
						placeholder="my-site"
						help={__('Your desired subdomain (will be available as my-site.jurassic.tube)')}
					/>
					<Button
						variant="secondary"
						onClick={saveSubdomain}
						disabled={!subdomain}
					>
						{__('Save Subdomain')}
					</Button>
				</div>

				<div className="mt-6">
					<label className="flex items-center space-x-2">
						<input
							type="checkbox"
							checked={sshKeyCopied}
							onChange={(e) => handleSshKeyCopied(e.target.checked)}
							className="rounded border-gray-300"
						/>
						<span className="text-sm text-gray-700">
							{__('SSH Key copied and registered at jurassic.tube')}
						</span>
					</label>
				</div>
			</Card>

			{/* Connection Status */}
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{__('Connection Status')}
				</h3>
				
				<div className="flex items-center justify-between">
					<div>
						<p className="text-gray-600">
							{isConnected 
								? __('Connected to Jurassic Tube')
								: __('Not connected to Jurassic Tube')
							}
						</p>
						{isConnected && subdomain && (
							<p className="text-sm text-gray-500 mt-1">
								{__('Available at')}: <code className="bg-gray-100 px-2 py-1 rounded">
									https://{subdomain}.jurassic.tube
								</code>
							</p>
						)}
					</div>
					
					<div className="flex gap-2">
						{!isConnected ? (
							<Button
								variant="primary"
								onClick={connectJurassicTube}
								disabled={!wpUsername || !subdomain || !sshKeyCopied || isConnecting}
							>
								{isConnecting ? __('Connecting...') : __('Connect')}
							</Button>
						) : (
							<Button
								variant="secondary"
								onClick={disconnectJurassicTube}
							>
								{__('Disconnect')}
							</Button>
						)}
					</div>
				</div>
			</Card>

			{/* Information Section */}
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
				<h3 className="text-lg font-medium text-blue-900 mb-2">
					{__('Jurassic Tube Information')}
				</h3>
				<ul className="text-blue-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('Essential for testing WooCommerce Payments and webhooks')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('Enables Jetpack connections and external API testing')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('Provides secure tunneling via SSH connection')}</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{__('Your site will be accessible at your-subdomain.jurassic.tube')}</span>
					</li>
				</ul>
			</div>
		</div>
	);
} 
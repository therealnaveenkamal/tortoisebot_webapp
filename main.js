let vueApp = new Vue({
    el: "#vueApp",
    data: {
        // ros connection
        ros: null,
        rosbridge_address: 'wss://i-0734dfc7411934198.robotigniteacademy.com/rosbridge/',
        connected: false,
        isGearMode: false,
        // page content
        menu_title: 'Connection',
        logWindowVisible: false,
        selectedWaypoint: null,
        // dragging data
        dragging: false,
        x: 'no',
        y: 'no',
        waypointMap: {
            waypoint1: [0.65, -0.5],
            waypoint2: [0.65, 0.45],
            waypoint3: [0.25, 0.48],
            waypoint4: [0.2, 0.0],
            waypoint5: [-0.12, 0.0],
            waypoint6: [-0.12, -0.5],
            waypoint7: [-0.12, 0.5],
        },
        dragCircleStyle: {
            margin: '0px',
            top: '0px',
            left: '0px',
            display: 'none',
            width: '75px',
            height: '75px',
        },
        // joystick valules
        joystick: {
            vertical: 0,
            horizontal: 0,
        },
        // publisher
        pubInterval: null,
        mapViewer: null,
        mapGridClient: null,
        interval: null,
        viewer: null,
        tfClient: null,
        urdfClient: null,
        goal: null,
        action: {
            goal: { position: {x: 0, y: 0, z: 0} },
            feedback: { position: 0, state: 'idle' },
            result: { success: false },
            status: { status: 0, text: '' },
        }
    },
    methods: {
        promptForRosbridgeAddress() {
            const address = prompt('Enter ROSBridge address:');
            if (address !== null) {
                this.rosbridge_address = address;
                this.ros = new ROSLIB.Ros({ url: this.rosbridge_address})

                // define callbacks
                this.ros.on('connection', () => {
                    this.connected = true
                    console.log('Connection to ROSBridge established!')
                    this.pubInterval = setInterval(this.publish, 100)
                    this.setCamera()

                    this.mapViewer = new ROS2D.Viewer({
                        divID: 'map',
                        width: 420,
                        height: 340
                    })

                    // Setup the map client.
                    this.mapGridClient = new ROS2D.OccupancyGridClient({
                        ros: this.ros,
                        rootObject: this.mapViewer.scene,
                        continuous: true,
                    })
                    // Scale the canvas to fit to the map
                    this.mapGridClient.on('change', () => {
                        this.mapViewer.scaleToDimensions(this.mapGridClient.currentGrid.width/4, this.mapGridClient.currentGrid.height/4);
                        this.mapViewer.shift(this.mapGridClient.currentGrid.pose.position.x+7.5, this.mapGridClient.currentGrid.pose.position.y+7.5)
                    })

                    this.setup3DViewer()


                })
                this.ros.on('error', (error) => {
                    this.connected = false
                    console.log('Something went wrong when trying to connect')
                    console.log(error)
                })
                this.ros.on('close', () => {
                    this.connected = false
                    console.log('Connection to ROSBridge was closed!')
                    clearInterval(this.pubInterval)
                    document.getElementById('divCamera').innerHTML = ''
                    document.getElementById('map').innerHTML = ''
                    this.unset3DViewer()

                })

            }
            else{
                this.promptForRosbridgeAddress()
            }
        },
        publish: function() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
            let message = new ROSLIB.Message({
                linear: { x: this.joystick.vertical, y: 0, z: 0, },
                angular: { x: 0, y: 0, z: this.joystick.horizontal, },
            })
            topic.publish(message)
        },
        disconnect: function() {
            this.ros.close()
        },
        sendCommand: function() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
            let message = new ROSLIB.Message({
                linear: { x: 1, y: 0, z: 0, },
                angular: { x: 0, y: 0, z: 0.5, },
            })
            topic.publish(message)
        },
        updateJoystickValue(value1, value2) {
            this.joystick.vertical = -1*value2;
            this.joystick.horizontal = -1*value1;
        },
        toggleLogWindow() {
            this.logWindowVisible = !this.logWindowVisible;
        },
        toggleConnection() {
            if(this.connected){
                this.disconnect()
            }
            else{
                this.promptForRosbridgeAddress()
            }
        },
        setCamera: function() {
            let without_wss = this.rosbridge_address.split('wss://')[1]
            console.log(without_wss)
            let domain = without_wss.split('/')[0] + '/' + without_wss.split('/')[1]
            console.log(domain)
            let host = domain + '/cameras'
            let viewer = new MJPEGCANVAS.Viewer({
                divID: 'divCamera',
                host: host,
                width: 420,
                height:360,
                topic: '/camera/image_raw',
                ssl: true,
            })
        },
        setup3DViewer() {
            this.viewer = new ROS3D.Viewer({
                background: '#cccccc',
                divID: 'div3DViewer',
                width: 420,
                height: 360,
                antialias: true,
                fixedFrame: 'odom'
            })

            // Add a grid.
            this.viewer.addObject(new ROS3D.Grid({
                color:'#0181c4',
                cellSize: 0.5,
                num_cells: 20
            }))

            // Setup a client to listen to TFs.
            this.tfClient = new ROSLIB.TFClient({
                ros: this.ros,
                angularThres: 0.01,
                transThres: 0.01,
                rate: 10.0
            })

            // Setup the URDF client.
            this.urdfClient = new ROS3D.UrdfClient({
                ros: this.ros,
                param: 'robot_description',
                tfClient: this.tfClient,
                // We use "path: location.origin + location.pathname"
                // instead of "path: window.location.href" to remove query params,
                // otherwise the assets fail to load
                path: location.origin + location.pathname,
                rootObject: this.viewer.scene,
                loader: ROS3D.COLLADA_LOADER_2
            })
        },
        goToWaypoint() {
            if (this.selectedWaypoint && this.waypointMap[this.selectedWaypoint]) {
                const selectedValues = this.waypointMap[this.selectedWaypoint];
                this.action.goal.position.x = selectedValues[0];
                this.action.goal.position.y = selectedValues[1];
                console.log(`Going to ${this.selectedWaypoint}: x = ${selectedValues[0]}, y = ${selectedValues[1]}`);

                this.sendGoal();
            } else {
                console.error('Invalid or undefined waypoint selected');
            }
        },
        unset3DViewer() {
            document.getElementById('div3DViewer').innerHTML = ''
        },
        sendGoal: function() {
            let actionClient = new ROSLIB.ActionClient({
                ros : this.ros,
                serverName : '/tortoisebot_as',
                actionName : 'course_web_dev_ros/WaypointActionAction'
            })

            this.goal = new ROSLIB.Goal({
                actionClient : actionClient,
                goalMessage: {
                    ...this.action.goal
                }
            })

            this.goal.on('status', (status) => {
                this.action.status = status
            })

            this.goal.on('feedback', (feedback) => {
                this.action.feedback = feedback
            })

            this.goal.on('result', (result) => {
                this.action.result = result
            })

            this.goal.send()
        },
        cancelGoal: function() {
            this.goal.cancel()
        },
    },
    mounted() {
    
        this.$nextTick(() => {
        this.$watch(() => this.$el, () => {
            // This code will be called after each re-render
            console.log('Vue instance and its children are fully rendered.');
            // Call your function here
            this.promptForRosbridgeAddress();
        });
    });

        this.interval = setInterval(() => {
            if (this.ros != null && this.ros.isConnected) {
                this.ros.getNodes((data) => { }, (error) => { })
            }
        }, 10000)
    },
})

class JoystickController {
    // stickID: ID of HTML element (representing joystick) that will be dragged
    // maxDistance: maximum amount joystick can move in any direction
    // deadzone: joystick must move at least this amount from origin to register value change
    constructor(stickID, maxDistance, deadzone, vm) {
        this.id = stickID;
        let stick = document.getElementById(stickID);

        // location from which drag begins, used to calculate offsets
        this.dragStart = null;

        // track touch identifier in case multiple joysticks present
        this.touchId = null;

        this.active = false;
        this.value = {x: 0, y: 0};
        this.vm = vm;

        this.vm.updateJoystickValue(0,0);

        let self = this;

        function handleDown(event) {
            self.active = true;

            // all drag movements are instantaneous
            stick.style.transition = '0s';

            // touch event fired before mouse event; prevent redundant mouse event from firing
            event.preventDefault();

            if (event.changedTouches)
                self.dragStart = {x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY};
            else
                self.dragStart = {x: event.clientX, y: event.clientY};

            // if this is a touch event, keep track of which one
            if (event.changedTouches)
                self.touchId = event.changedTouches[0].identifier;
        }

        function handleMove(event) {
            if (!self.active) return;

            // if this is a touch event, make sure it is the right one
            // also handle multiple simultaneous touchmove events
            let touchmoveId = null;
            if (event.changedTouches) {
                for (let i = 0; i < event.changedTouches.length; i++) {
                    if (self.touchId == event.changedTouches[i].identifier) {
                        touchmoveId = i;
                        event.clientX = event.changedTouches[i].clientX;
                        event.clientY = event.changedTouches[i].clientY;
                    }
                }

                if (touchmoveId == null) return;
            }

            const xDiff = event.clientX - self.dragStart.x;
            const yDiff = event.clientY - self.dragStart.y;
            const angle = Math.atan2(yDiff, xDiff);
            const distance = Math.min(maxDistance, Math.hypot(xDiff, yDiff));
            const xPosition = distance * Math.cos(angle);
            const yPosition = distance * Math.sin(angle);

            // move stick image to new position
            stick.style.transform = `translate3d(${xPosition}px, ${yPosition}px, 0px)`;

            // deadzone adjustment
            const distance2 = (distance < deadzone) ? 0 : maxDistance / (maxDistance - deadzone) * (distance - deadzone);
            const xPosition2 = distance2 * Math.cos(angle);
            const yPosition2 = distance2 * Math.sin(angle);
            const xPercent = parseFloat((xPosition2 / maxDistance).toFixed(4));
            const yPercent = parseFloat((yPosition2 / maxDistance).toFixed(4));

            self.value = {x: xPercent, y: yPercent};
            this.vm.updateJoystickValue(xPercent, yPercent);

        }

        function handleUp(event) {
            if (!self.active) return;

            // if this is a touch event, make sure it is the right one
            if (event.changedTouches && self.touchId != event.changedTouches[0].identifier) return;

            // transition the joystick position back to center
            stick.style.transition = '.2s';
            stick.style.transform = `translate3d(0px, 0px, 0px)`;

            // reset everything
            self.value = {x: 0, y: 0};
            self.touchId = null;
            self.active = false;
            this.vm.updateJoystickValue(0,0);

        }

        // Bind the event handlers to the current instance of JoystickController
        this.handleDown = handleDown.bind(this);
        this.handleMove = handleMove.bind(this);
        this.handleUp = handleUp.bind(this);

        stick.addEventListener('mousedown', this.handleDown);
        stick.addEventListener('touchstart', this.handleDown);
        document.addEventListener('mousemove', this.handleMove, { passive: false });
        document.addEventListener('touchmove', this.handleMove, { passive: false });
        document.addEventListener('mouseup', this.handleUp);
        document.addEventListener('touchend', this.handleUp);
    }
}

let joystick1 = new JoystickController("stick1", 64, 8, vueApp);

function update() {
    console.log(JSON.stringify(joystick1.value))
}

function loop() {
    requestAnimationFrame(loop);
    update();
}

loop();